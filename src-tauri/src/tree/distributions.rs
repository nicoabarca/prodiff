//! Distributions — the value counts behind one node's charts, queried per
//! selected node rather than shipped with the build. See
//! `docs/adr/0003-query-distributions-on-demand.md` for why this one thing
//! doesn't travel in the tree payload like everything else does.
//!
//! A node is named by the Variant keys of the leaves in its subtree plus its
//! depth, which is the build's own currency — so nothing here re-derives node
//! identity by joining activity labels, and the terminal/non-terminal split
//! that `(parent, activity, terminates-here)` encodes comes along for free.

use super::stats::quantile;
use super::{read_group, variant_key, Acc, AttrSpec, GroupRows, Source, ACTIVITY_DURATION, TRANSITION_TIME};
use crate::column_mapping::{find_role, ColumnGranularity, ColumnMapping, ColumnRole, ColumnType};
use polars::prelude::*;
use std::collections::{HashMap, HashSet};

/// How many categories ship at most. The frontend cuts to its own top-N and
/// derives the `other` bucket from the totals, so this only bounds the payload
/// for a free-text column with tens of thousands of distinct values.
const SHIP_VALUES: usize = 200;
/// Bin count is clamped here. Freedman-Diaconis on a near-constant attribute
/// asks for one bin and on a heavy tail asks for thousands; neither draws. The
/// ceiling is low because the bins are drawn as labelled horizontal bands — a
/// heavy tail spends its extra bins on near-empty ranges, so raising it buys
/// scrolling rather than detail.
const MIN_BINS: usize = 8;
const MAX_BINS: usize = 20;

/// Which of a node's cases' events are counted. The set of cases is the same
/// either way — only the events change.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    /// The single event at this node's own position in the trace.
    AtStep,
    /// Every event of those cases, at every position.
    WholeCase,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    pub value: String,
    pub a: i64,
    pub b: i64,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Distribution {
    /// Categories by pooled count, biggest first, capped at `SHIP_VALUES`.
    /// `totalA`/`totalB` count *every* value including the ones cut, so the
    /// frontend's `other` bucket is exact at whatever cutoff it draws:
    /// `otherA = totalA - sum(shown.a)`.
    #[serde(rename_all = "camelCase")]
    Categorical {
        values: Vec<CategoryCount>,
        /// Distinct values counted, before any cut.
        distinct: usize,
        total_a: i64,
        total_b: i64,
    },
    /// Bin edges are computed once over both Groups pooled, so the two series
    /// are drawn on the same axis and can be read against each other.
    /// `edges.len() == counts_a.len() + 1`.
    #[serde(rename_all = "camelCase")]
    Numerical {
        edges: Vec<f64>,
        counts_a: Vec<i64>,
        counts_b: Vec<i64>,
        n_a: usize,
        n_b: usize,
    },
    /// Every value was null, so there is nothing to bin or count.
    Empty,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NodeDistributions {
    /// In the order the attributes were requested, so the cards keep theirs.
    pub attributes: Vec<(String, Distribution)>,
    pub cases_a: i64,
    pub cases_b: i64,
    /// Events actually counted. Says out loud how much wider `wholeCase` is
    /// than `atStep`, which is the difference the Scope badge is about.
    pub events_a: i64,
    pub events_b: i64,
}

/// One requested attribute, resolved against the mapping.
struct Plan {
    name: String,
    numeric: bool,
    /// A case-granularity column carries one value per case, repeated on every
    /// row. Counting it once per event would multiply it by the trace length
    /// under `wholeCase`, so it is read from the case's first row in both
    /// Scopes — which makes the two Scopes identical for such a column, and
    /// correctly so.
    per_case: bool,
    /// Index into `GroupRows::values`. `None` for Transition Time, which isn't
    /// a column: `read_group` computes it alongside the case split, so it is
    /// read off `GroupRows::transition` instead.
    value_index: Option<usize>,
}

/// Resolves the requested names against the mapping — dropping any it doesn't
/// know — and builds the parallel `AttrSpec` list `read_group` consumes.
fn plan(
    requested: &[String],
    mapping: &[ColumnMapping],
    has_start: bool,
) -> (Vec<Plan>, Vec<AttrSpec>) {
    let mut plans = Vec::new();
    let mut specs = Vec::new();

    for name in requested {
        if name == TRANSITION_TIME {
            plans.push(Plan {
                name: name.clone(),
                numeric: true,
                per_case: false,
                value_index: None,
            });
            continue;
        }
        if name == ACTIVITY_DURATION {
            // Without a start timestamp there is no duration to derive, so the
            // attribute is dropped rather than charted as all-null.
            if has_start {
                plans.push(Plan {
                    name: name.clone(),
                    numeric: true,
                    per_case: false,
                    value_index: Some(specs.len()),
                });
                specs.push(AttrSpec {
                    name: name.clone(),
                    numeric: true,
                    source: Source::Duration,
                });
            }
            continue;
        }
        let Some(column) = mapping.iter().find(|c| &c.name == name) else {
            continue;
        };
        let numeric = matches!(column.column_type, ColumnType::Integer | ColumnType::Float);
        plans.push(Plan {
            name: name.clone(),
            numeric,
            per_case: column.granularity == ColumnGranularity::Case,
            value_index: Some(specs.len()),
        });
        specs.push(AttrSpec {
            name: name.clone(),
            numeric,
            source: Source::Column(name.clone()),
        });
    }
    (plans, specs)
}

/// The rows one case contributes, given the Scope. `None` when the case is
/// shorter than the node's depth, which a case on one of the node's own
/// Variants never is — but a malformed selection could be.
fn rows_for(
    bounds: (usize, usize),
    depth: usize,
    scope: Scope,
) -> Option<std::ops::Range<usize>> {
    let (from, to) = bounds;
    match scope {
        Scope::WholeCase => Some(from..to),
        // Depth 0 is the synthetic Start root, which has no event of its own;
        // the node at depth d is the d-th activity, so row index d - 1.
        Scope::AtStep => {
            let row = from.checked_add(depth.checked_sub(1)?)?;
            (row < to).then(|| row..row + 1)
        }
    }
}

/// Accumulates one Group's values into `acc`, and returns the cases and events
/// it counted.
fn accumulate(
    rows: &GroupRows,
    plans: &[Plan],
    variants: &HashSet<String>,
    depth: usize,
    scope: Scope,
    acc: &mut [Acc],
) -> (i64, i64) {
    let mut cases = 0;
    let mut events = 0;
    for case in 0..rows.case_ids.len() {
        if !variants.contains(&variant_key(rows, case)) {
            continue;
        }
        let bounds = rows.bounds[case];
        let Some(range) = rows_for(bounds, depth, scope) else {
            continue;
        };
        cases += 1;
        events += range.len() as i64;

        for (i, plan) in plans.iter().enumerate() {
            // A case-level column is read once, from the case's first row,
            // whatever the Scope asked for.
            let read = if plan.per_case {
                bounds.0..bounds.0 + 1
            } else {
                range.clone()
            };
            for row in read {
                let Some(index) = plan.value_index else {
                    if let (Some(value), Acc::Num(out)) = (rows.transition[row], &mut acc[i]) {
                        out.push(value);
                    }
                    continue;
                };
                match (&rows.values[index], &mut acc[i]) {
                    (super::Values::Num(v), Acc::Num(out)) => {
                        if let Some(value) = v[row] {
                            out.push(value);
                        }
                    }
                    (super::Values::Cat(v), Acc::Cat(out)) => {
                        if let Some(value) = &v[row] {
                            *out.entry(value.clone()).or_default() += 1;
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    (cases, events)
}

/// Freedman-Diaconis bin count over the pooled values: width `2·IQR·n^(-1/3)`,
/// clamped. Falls back to `MIN_BINS` when the IQR is zero, which happens when
/// most of the mass sits on one value — a common shape for durations, and one
/// where FD's width collapses to nothing.
fn bin_count(sorted: &[f64], min: f64, max: f64) -> usize {
    if max <= min {
        return 1;
    }
    let iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
    if iqr <= 0.0 {
        return MIN_BINS;
    }
    let width = 2.0 * iqr * (sorted.len() as f64).powf(-1.0 / 3.0);
    if width <= 0.0 || !width.is_finite() {
        return MIN_BINS;
    }
    (((max - min) / width).ceil() as usize).clamp(MIN_BINS, MAX_BINS)
}

fn bin(values: &[f64], edges: &[f64]) -> Vec<i64> {
    let bins = edges.len() - 1;
    let (min, max) = (edges[0], edges[bins]);
    let mut counts = vec![0i64; bins];
    for &value in values {
        // Half-open bins except the last, which is closed so `max` lands in it
        // rather than falling off the end.
        let index = if value >= max {
            bins - 1
        } else if value <= min {
            0
        } else {
            (((value - min) / (max - min)) * bins as f64).floor() as usize
        };
        counts[index.min(bins - 1)] += 1;
    }
    counts
}

fn numerical(a: &[f64], b: &[f64]) -> Distribution {
    if a.is_empty() && b.is_empty() {
        return Distribution::Empty;
    }
    let mut pooled: Vec<f64> = a.iter().chain(b).copied().filter(|v| v.is_finite()).collect();
    if pooled.is_empty() {
        return Distribution::Empty;
    }
    pooled.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
    let (min, max) = (pooled[0], pooled[pooled.len() - 1]);
    let bins = bin_count(&pooled, min, max);
    // A constant attribute still needs a bin with width, or every value sits on
    // a zero-wide edge and nothing draws.
    let (lo, hi) = if max > min { (min, max) } else { (min, min + 1.0) };
    let edges: Vec<f64> = (0..=bins)
        .map(|i| lo + (hi - lo) * i as f64 / bins as f64)
        .collect();

    Distribution::Numerical {
        counts_a: bin(a, &edges),
        counts_b: bin(b, &edges),
        n_a: a.len(),
        n_b: b.len(),
        edges,
    }
}

fn categorical(a: &HashMap<String, i64>, b: &HashMap<String, i64>) -> Distribution {
    let total_a: i64 = a.values().sum();
    let total_b: i64 = b.values().sum();
    if total_a == 0 && total_b == 0 {
        return Distribution::Empty;
    }
    let mut values: Vec<CategoryCount> = a
        .keys()
        .chain(b.keys())
        .collect::<HashSet<_>>()
        .into_iter()
        .map(|value| CategoryCount {
            a: *a.get(value).unwrap_or(&0),
            b: *b.get(value).unwrap_or(&0),
            value: value.clone(),
        })
        .collect();
    // Pooled count then value, so the ranking is stable across Scopes and
    // across renders rather than following HashMap iteration order.
    values.sort_by(|x, y| (y.a + y.b).cmp(&(x.a + x.b)).then_with(|| x.value.cmp(&y.value)));
    let distinct = values.len();
    values.truncate(SHIP_VALUES);

    Distribution::Categorical {
        values,
        distinct,
        total_a,
        total_b,
    }
}

/// Counts one node's attribute values, per Group, under one Scope.
pub fn distributions(
    group_a: &DataFrame,
    group_b: Option<&DataFrame>,
    mapping: &[ColumnMapping],
    attributes: &[String],
    variants: &[String],
    depth: usize,
    scope: Scope,
) -> Result<NodeDistributions, String> {
    if scope == Scope::AtStep && depth == 0 {
        return Err("The Start node has no event of its own.".to_string());
    }

    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let (plans, specs) = plan(attributes, mapping, has_start);

    let variants: HashSet<String> = variants.iter().cloned().collect();
    let mut acc_a: Vec<Acc> = plans.iter().map(|p| Acc::new(p.numeric)).collect();
    let mut acc_b: Vec<Acc> = plans.iter().map(|p| Acc::new(p.numeric)).collect();

    let rows_a = read_group(group_a, mapping, &specs)?;
    let (cases_a, events_a) = accumulate(&rows_a, &plans, &variants, depth, scope, &mut acc_a);
    let (cases_b, events_b) = match group_b {
        Some(df) => {
            let rows = read_group(df, mapping, &specs)?;
            accumulate(&rows, &plans, &variants, depth, scope, &mut acc_b)
        }
        None => (0, 0),
    };

    let attributes = plans
        .iter()
        .zip(acc_a.iter().zip(&acc_b))
        .map(|(plan, (a, b))| {
            let distribution = match (a, b) {
                (Acc::Num(a), Acc::Num(b)) => numerical(a, b),
                (Acc::Cat(a), Acc::Cat(b)) => categorical(a, b),
                _ => Distribution::Empty,
            };
            (plan.name.clone(), distribution)
        })
        .collect();

    Ok(NodeDistributions {
        attributes,
        cases_a,
        cases_b,
        events_a,
        events_b,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn at_step_reads_the_node_position_whole_case_reads_the_trace() {
        // Depth 3 on a 4-event case: at-step is one row, whole-case is four.
        assert_eq!(rows_for((10, 14), 3, Scope::AtStep), Some(12..13));
        assert_eq!(rows_for((10, 14), 3, Scope::WholeCase), Some(10..14));
        // Depth past the end of the case, and the root under at-step.
        assert_eq!(rows_for((10, 14), 9, Scope::AtStep), None);
        assert_eq!(rows_for((10, 14), 0, Scope::AtStep), None);
    }

    #[test]
    fn bins_are_shared_and_hold_every_value() {
        let a = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let b = vec![6.0, 7.0, 8.0, 9.0, 10.0];
        let Distribution::Numerical {
            edges,
            counts_a,
            counts_b,
            ..
        } = numerical(&a, &b)
        else {
            panic!("expected a numerical distribution");
        };
        assert_eq!(edges.len(), counts_a.len() + 1);
        assert_eq!(counts_a.len(), counts_b.len());
        // Nothing falls off either end — the max lands in the last bin.
        assert_eq!(counts_a.iter().sum::<i64>(), 5);
        assert_eq!(counts_b.iter().sum::<i64>(), 5);
        assert_eq!(edges[0], 1.0);
        assert_eq!(*edges.last().unwrap(), 10.0);
    }

    #[test]
    fn a_constant_attribute_still_bins() {
        let Distribution::Numerical { counts_a, .. } = numerical(&[7.0, 7.0, 7.0], &[]) else {
            panic!("expected a numerical distribution");
        };
        assert_eq!(counts_a.iter().sum::<i64>(), 3);
    }

    #[test]
    fn categories_rank_by_pooled_count_and_totals_cover_the_tail() {
        let a = HashMap::from([("x".into(), 5), ("y".into(), 1)]);
        let b = HashMap::from([("y".into(), 9), ("z".into(), 2)]);
        let Distribution::Categorical {
            values,
            distinct,
            total_a,
            total_b,
        } = categorical(&a, &b)
        else {
            panic!("expected a categorical distribution");
        };
        assert_eq!(distinct, 3);
        assert_eq!(values[0].value, "y"); // 1 + 9 beats 5 + 0
        assert_eq!(total_a, 6);
        assert_eq!(total_b, 11);
        // The frontend's `other` bucket at a cutoff of 1 is exact.
        assert_eq!(total_a - values[0].a, 5);
    }

    /// End to end over a real DataFrame: the depth offset, the Variant match
    /// and the value indexing all only exist once `read_group` is in the loop.
    #[test]
    fn scope_decides_the_events_but_never_the_cases() {
        let mapping = super::super::tests::mapping();
        // Two cases through `B` at depth 2, one that doesn't reach it.
        let log = super::super::tests::log(&[
            ("1", &["A", "B", "C"], &[10, 60, 10]),
            ("2", &["A", "B", "D"], &[10, 60, 90]),
            ("3", &["A", "E"], &[10, 10]),
        ]);
        let variants = vec![
            "A\u{1}B\u{1}C".to_string(),
            "A\u{1}B\u{1}D".to_string(),
        ];
        let attributes = vec!["who".to_string()];

        let at_step =
            distributions(&log, None, &mapping, &attributes, &variants, 2, Scope::AtStep).unwrap();
        let whole =
            distributions(&log, None, &mapping, &attributes, &variants, 2, Scope::WholeCase)
                .unwrap();

        // Same cases either way — that is the whole point of the Scope split.
        assert_eq!(at_step.cases_a, 2);
        assert_eq!(whole.cases_a, 2);
        // One event each at depth 2; every event of both traces otherwise.
        assert_eq!(at_step.events_a, 2);
        assert_eq!(whole.events_a, 6);

        // `who` is "Ana" above cost 50: both B events, and nothing else.
        let Distribution::Categorical { values, total_a, .. } = &at_step.attributes[0].1 else {
            panic!("expected a categorical distribution");
        };
        assert_eq!(*total_a, 2);
        assert_eq!(values[0].value, "Ana");
        assert_eq!(values[0].a, 2);

        let Distribution::Categorical { values, total_a, .. } = &whole.attributes[0].1 else {
            panic!("expected a categorical distribution");
        };
        assert_eq!(*total_a, 6);
        // Case 3 never reaches this node, so its events are absent from both.
        let ana = values.iter().find(|c| c.value == "Ana").unwrap();
        assert_eq!(ana.a, 3); // two B events plus case 2's cost-90 D
    }

    #[test]
    fn everything_null_is_empty_not_a_chart_of_zeroes() {
        assert!(matches!(numerical(&[], &[]), Distribution::Empty));
        assert!(matches!(
            categorical(&HashMap::new(), &HashMap::new()),
            Distribution::Empty
        ));
    }
}

//! The value counts behind one node's charts, queried per selected node.
//!
//! A node is named by the Variant keys of the leaves in its subtree plus its
//! depth, so nothing here re-derives node identity by joining activity labels.

use super::{read_group, resolved_row, variant_key, AttrSpec, GroupRows, Source};
use crate::analysis::stats::{quantile, tukey};
use crate::analysis::{Acc, GroupLog, ACTIVITY_DURATION, TRANSITION_TIME};
use crate::column_mapping::{
    find_role, CaseResolution, ColumnMapping, ColumnRole, ColumnScope, ColumnType,
};
use std::collections::{HashMap, HashSet};

/// How many categories ship at most. The frontend cuts to its own top-N and
/// derives the `other` bucket from the totals, so this only bounds the payload.
const SHIP_VALUES: usize = 200;
/// Bin count is clamped here. Freedman-Diaconis on a near-constant attribute
/// asks for one bin and on a heavy tail asks for thousands; neither draws.
const MIN_BINS: usize = 8;
const MAX_BINS: usize = 20;

/// Percentiles the ECDF ladder is sampled at, 0 through 100 inclusive. One per
/// percent is finer than a card is wide, so the curve is exact as drawn.
const ECDF_STEPS: usize = 100;

/// The coarsest a log-bin ladder may get before it stops being readable.
const MAX_LOG_BINS: usize = 8;

/// Boundaries a person would actually pick for a duration, in milliseconds.
///
/// Time is not decimal, so a geometric ladder computed from the data lands on
/// edges like "1m47s". Durations are the only attributes binned this way.
const DURATION_EDGES: [f64; 16] = [
    1_000.0,           // 1s
    5_000.0,           // 5s
    15_000.0,          // 15s
    30_000.0,          // 30s
    60_000.0,          // 1m
    300_000.0,         // 5m
    900_000.0,         // 15m
    1_800_000.0,       // 30m
    3_600_000.0,       // 1h
    7_200_000.0,       // 2h
    21_600_000.0,      // 6h
    43_200_000.0,      // 12h
    86_400_000.0,      // 1d
    259_200_000.0,     // 3d
    604_800_000.0,     // 7d
    2_592_000_000.0,   // 30d
];

/// Which of a node's cases' events are counted. The set of cases is the same
/// either way; only the events change.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    AtStep,
    WholeCase,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    pub value: String,
    pub counts: HashMap<String, i64>,
}

/// A Group's five-number summary with Tukey whiskers, for the box plot.
///
/// The whiskers are the extreme values still inside 1.5·IQR, actual
/// observations and not the fences. The points beyond them are counted, not
/// shipped: on a heavy tail they run to thousands.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BoxStats {
    pub min: f64,
    pub q1: f64,
    pub median: f64,
    pub q3: f64,
    pub max: f64,
    pub whisker_low: f64,
    pub whisker_high: f64,
    pub outliers_low: usize,
    pub outliers_high: usize,
}

/// The three shapes a duration is read in, alongside the equal-width bins every
/// numerical attribute gets.
///
/// Durations are heavily right-skewed, and none of these can be recovered from
/// binned counts after the fact, so they are computed here.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DurationShape {
    pub ecdf: HashMap<String, Vec<f64>>,
    pub box_stats: HashMap<String, BoxStats>,
    pub log_edges: Vec<f64>,
    pub log_counts: HashMap<String, Vec<i64>>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Distribution {
    #[serde(rename_all = "camelCase")]
    Categorical {
        values: Vec<CategoryCount>,
        distinct: usize,
        totals: HashMap<String, i64>,
    },
    #[serde(rename_all = "camelCase")]
    Numerical {
        edges: Vec<f64>,
        counts: HashMap<String, Vec<i64>>,
        n: HashMap<String, usize>,
        shape: Option<DurationShape>,
    },
    Empty,
}

/// One Group's totals at this node. `events` says out loud how much wider
/// `wholeCase` is than `atStep`, which is the difference the Scope badge is
/// about.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GroupTotals {
    pub id: String,
    pub cases: i64,
    pub events: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NodeDistributions {
    pub groups: Vec<GroupTotals>,
    pub attributes: Vec<(String, Distribution)>,
}

/// One requested attribute, resolved against the mapping.
struct Plan {
    name: String,
    numeric: bool,
    per_case: bool,
    resolution: CaseResolution,
    value_index: Option<usize>,
}

/// Resolves the requested names against the mapping, dropping any it does not
/// know, and builds the parallel `AttrSpec` list `read_group` consumes.
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
                resolution: CaseResolution::default(),
                value_index: None,
            });
            continue;
        }
        if name == ACTIVITY_DURATION {
            // Without a start timestamp there is no duration to derive, so the
            // attribute is dropped.
            if has_start {
                plans.push(Plan {
                    name: name.clone(),
                    numeric: true,
                    per_case: false,
                    resolution: CaseResolution::default(),
                    value_index: Some(specs.len()),
                });
                specs.push(AttrSpec {
                    name: name.clone(),
                    numeric: true,
                    source: Source::Duration,
                    resolution: CaseResolution::default(),
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
            per_case: column.scope == ColumnScope::Case,
            resolution: column.case_resolution,
            value_index: Some(specs.len()),
        });
        specs.push(AttrSpec {
            name: name.clone(),
            numeric,
            source: Source::Column(name.clone()),
            resolution: column.case_resolution,
        });
    }
    (plans, specs)
}

/// The rows one case contributes, given the Scope. `None` when the case is
/// shorter than the node's depth, which only a malformed selection produces.
fn rows_for(bounds: (usize, usize), depth: usize, scope: Scope) -> Option<std::ops::Range<usize>> {
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
            // A case-level column is read once, whatever the Scope asked for.
            let read = if plan.per_case {
                let row = resolved_row(bounds, plan.resolution);
                row..row + 1
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
/// clamped. Falls back to `MIN_BINS` when the IQR is zero, where FD's width
/// collapses to nothing.
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
        // Half-open bins except the last, which is closed so `max` lands in it.
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

/// The value at each percentile from 0 to 100. Empty in, empty out: a Group
/// absent from this node has no curve.
fn ecdf(sorted: &[f64]) -> Vec<f64> {
    if sorted.is_empty() {
        return Vec::new();
    }
    (0..=ECDF_STEPS)
        .map(|step| quantile(sorted, step as f64 / ECDF_STEPS as f64))
        .collect()
}

fn box_stats(sorted: &[f64]) -> Option<BoxStats> {
    let (first, last) = (*sorted.first()?, *sorted.last()?);
    let (whisker_low, whisker_high, outliers_low, outliers_high) = tukey(sorted);
    Some(BoxStats {
        min: first,
        q1: quantile(sorted, 0.25),
        median: quantile(sorted, 0.5),
        q3: quantile(sorted, 0.75),
        max: last,
        whisker_low,
        whisker_high,
        outliers_low,
        outliers_high,
    })
}

/// Bin edges from the written-down duration ladder, trimmed to the data and
/// coarsened until few enough to label.
///
/// Zero is always the first edge: a duration of nothing is common and its log
/// does not exist, so the first bin is "under the first boundary".
fn log_edges(max: f64) -> Vec<f64> {
    let within: Vec<f64> = DURATION_EDGES
        .iter()
        .copied()
        .filter(|e| *e < max)
        .collect();
    // Coarsening by stride keeps the ladder's own boundaries: every other rung
    // is still a rung. `n` rungs make `n + 1` bins once the leading "under the
    // first rung" bin is counted, so the budget the stride divides is one short
    // of the ceiling.
    let stride = within.len().div_ceil(MAX_LOG_BINS - 1).max(1);
    let mut edges = vec![0.0];
    edges.extend(within.iter().step_by(stride));
    // The last bin is closed on the data's own maximum, so the tail has an end.
    edges.push(if max > *edges.last().unwrap_or(&0.0) {
        max
    } else {
        max + 1.0
    });
    edges
}

/// Counts into bins the edges name outright: the log ladder's bins are unequal,
/// so a range cannot be divided.
fn bin_by_edges(values: &[f64], edges: &[f64]) -> Vec<i64> {
    let bins = edges.len() - 1;
    let mut counts = vec![0i64; bins];
    for &value in values {
        // The last bin is closed so the maximum lands in it; `partition_point`
        // gives the first edge strictly above.
        let index = edges
            .partition_point(|edge| *edge <= value)
            .saturating_sub(1);
        counts[index.min(bins - 1)] += 1;
    }
    counts
}

/// The three duration-only encodings, computed from the sorted values in hand.
fn duration_shape(ids: &[String], per_group: [&[f64]; 2], max: f64) -> DurationShape {
    let edges = log_edges(max);
    DurationShape {
        ecdf: keyed(
            ids,
            per_group.map(|values| (!values.is_empty()).then(|| ecdf(values))),
        ),
        box_stats: keyed(ids, per_group.map(box_stats)),
        log_counts: keyed(
            ids,
            per_group.map(|values| Some(bin_by_edges(values, &edges))),
        ),
        log_edges: edges,
    }
}

/// Pairs per-Group values with the ids they belong to, dropping the ones with
/// nothing to say. The internals index Groups positionally; only the payload
/// speaks in ids.
fn keyed<T>(ids: &[String], values: [Option<T>; 2]) -> HashMap<String, T> {
    ids.iter()
        .cloned()
        .zip(values)
        .filter_map(|(id, value)| Some((id, value?)))
        .collect()
}

fn numerical(ids: &[String], per_group: [&[f64]; 2], duration: bool) -> Distribution {
    if per_group.iter().all(|values| values.is_empty()) {
        return Distribution::Empty;
    }
    let mut pooled: Vec<f64> = per_group
        .iter()
        .flat_map(|values| values.iter())
        .copied()
        .filter(|v| v.is_finite())
        .collect();
    if pooled.is_empty() {
        return Distribution::Empty;
    }
    pooled.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
    let (min, max) = (pooled[0], pooled[pooled.len() - 1]);
    let bins = bin_count(&pooled, min, max);
    // A constant attribute still needs a bin with width, or every value sits on
    // a zero-wide edge and nothing draws.
    let (lo, hi) = if max > min {
        (min, max)
    } else {
        (min, min + 1.0)
    };
    let edges: Vec<f64> = (0..=bins)
        .map(|i| lo + (hi - lo) * i as f64 / bins as f64)
        .collect();

    // Sorted per Group only where a duration asks for it: the quantile ladder
    // and the whiskers both need order.
    let shape = duration.then(|| {
        let sorted = |values: &[f64]| {
            let mut own: Vec<f64> = values.iter().copied().filter(|v| v.is_finite()).collect();
            own.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
            own
        };
        let sorted = per_group.map(|values| sorted(values));
        duration_shape(ids, [&sorted[0], &sorted[1]], max)
    });

    Distribution::Numerical {
        counts: keyed(ids, per_group.map(|values| Some(bin(values, &edges)))),
        n: keyed(ids, per_group.map(|values| Some(values.len()))),
        edges,
        shape,
    }
}

fn categorical(ids: &[String], per_group: [&HashMap<String, i64>; 2]) -> Distribution {
    let totals = per_group.map(|counts| counts.values().sum::<i64>());
    if totals.iter().all(|total| *total == 0) {
        return Distribution::Empty;
    }
    let mut values: Vec<CategoryCount> = per_group
        .iter()
        .flat_map(|counts| counts.keys())
        .collect::<HashSet<_>>()
        .into_iter()
        .map(|value| CategoryCount {
            counts: keyed(
                ids,
                per_group.map(|counts| Some(*counts.get(value).unwrap_or(&0))),
            ),
            value: value.clone(),
        })
        .collect();
    // Pooled count then value, so the ranking is stable across Scopes and renders.
    let pooled = |row: &CategoryCount| row.counts.values().sum::<i64>();
    values.sort_by(|x, y| {
        pooled(y)
            .cmp(&pooled(x))
            .then_with(|| x.value.cmp(&y.value))
    });
    let distinct = values.len();
    values.truncate(SHIP_VALUES);

    Distribution::Categorical {
        values,
        distinct,
        totals: keyed(ids, totals.map(Some)),
    }
}

/// Counts one node's attribute values, per Group, under one Scope.
pub fn distributions(
    logs: &[GroupLog],
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

    let ids: Vec<String> = logs.iter().map(|log| log.id.clone()).collect();
    let variants: HashSet<String> = variants.iter().cloned().collect();
    let mut acc_a: Vec<Acc> = plans.iter().map(|p| Acc::new(p.numeric)).collect();
    let mut acc_b: Vec<Acc> = plans.iter().map(|p| Acc::new(p.numeric)).collect();

    let rows_a = read_group(&logs[0].df, mapping, &specs)?;
    let (cases_a, events_a) = accumulate(&rows_a, &plans, &variants, depth, scope, &mut acc_a);
    let (cases_b, events_b) = match logs.get(1) {
        Some(log) => {
            let rows = read_group(&log.df, mapping, &specs)?;
            accumulate(&rows, &plans, &variants, depth, scope, &mut acc_b)
        }
        None => (0, 0),
    };

    let attributes = plans
        .iter()
        .zip(acc_a.iter().zip(&acc_b))
        .map(|(plan, (a, b))| {
            let duration = plan.name == ACTIVITY_DURATION || plan.name == TRANSITION_TIME;
            let distribution = match (a, b) {
                (Acc::Num(a), Acc::Num(b)) => numerical(&ids, [a, b], duration),
                (Acc::Cat(a), Acc::Cat(b)) => categorical(&ids, [a, b]),
                _ => Distribution::Empty,
            };
            (plan.name.clone(), distribution)
        })
        .collect();

    let totals = [(cases_a, events_a), (cases_b, events_b)];
    Ok(NodeDistributions {
        groups: ids
            .iter()
            .zip(totals)
            .map(|(id, (cases, events))| GroupTotals {
                id: id.clone(),
                cases,
                events,
            })
            .collect(),
        attributes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids() -> Vec<String> {
        vec!["a".to_string(), "b".to_string()]
    }

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
        let Distribution::Numerical { edges, counts, .. } = numerical(&ids(), [&a, &b], false)
        else {
            panic!("expected a numerical distribution");
        };
        let (counts_a, counts_b) = (&counts["a"], &counts["b"]);
        assert_eq!(edges.len(), counts_a.len() + 1);
        assert_eq!(counts_a.len(), counts_b.len());
        // Nothing falls off either end: the max lands in the last bin.
        assert_eq!(counts_a.iter().sum::<i64>(), 5);
        assert_eq!(counts_b.iter().sum::<i64>(), 5);
        assert_eq!(edges[0], 1.0);
        assert_eq!(*edges.last().unwrap(), 10.0);
    }

    #[test]
    fn a_constant_attribute_still_bins() {
        let Distribution::Numerical { counts, .. } =
            numerical(&ids(), [&[7.0, 7.0, 7.0], &[]], false)
        else {
            panic!("expected a numerical distribution");
        };
        assert_eq!(counts["a"].iter().sum::<i64>(), 3);
    }

    #[test]
    fn categories_rank_by_pooled_count_and_totals_cover_the_tail() {
        let a = HashMap::from([("x".into(), 5), ("y".into(), 1)]);
        let b = HashMap::from([("y".into(), 9), ("z".into(), 2)]);
        let Distribution::Categorical {
            values,
            distinct,
            totals,
        } = categorical(&ids(), [&a, &b])
        else {
            panic!("expected a categorical distribution");
        };
        assert_eq!(distinct, 3);
        assert_eq!(values[0].value, "y"); // 1 + 9 beats 5 + 0
        assert_eq!(totals["a"], 6);
        assert_eq!(totals["b"], 11);
        // The frontend's `other` bucket at a cutoff of 1 is exact.
        assert_eq!(totals["a"] - values[0].counts["a"], 5);
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
        let variants = vec!["A\u{1}B\u{1}C".to_string(), "A\u{1}B\u{1}D".to_string()];
        let attributes = vec!["who".to_string()];

        let logs = super::super::tests::logs(&log, None);
        let at_step =
            distributions(&logs, &mapping, &attributes, &variants, 2, Scope::AtStep).unwrap();
        let whole =
            distributions(&logs, &mapping, &attributes, &variants, 2, Scope::WholeCase).unwrap();

        // Same cases either way, which is the point of the Scope split.
        assert_eq!(at_step.groups[0].cases, 2);
        assert_eq!(whole.groups[0].cases, 2);
        // One event each at depth 2; every event of both traces otherwise.
        assert_eq!(at_step.groups[0].events, 2);
        assert_eq!(whole.groups[0].events, 6);

        // `who` is "Ana" above cost 50: both B events, and nothing else.
        let Distribution::Categorical { values, totals, .. } = &at_step.attributes[0].1 else {
            panic!("expected a categorical distribution");
        };
        assert_eq!(totals["a"], 2);
        assert_eq!(values[0].value, "Ana");
        assert_eq!(values[0].counts["a"], 2);

        let Distribution::Categorical { values, totals, .. } = &whole.attributes[0].1 else {
            panic!("expected a categorical distribution");
        };
        assert_eq!(totals["a"], 6);
        // Case 3 never reaches this node, so its events are absent from both.
        let ana = values.iter().find(|c| c.value == "Ana").unwrap();
        assert_eq!(ana.counts["a"], 3); // two B events plus case 2's cost-90 D
    }

    #[test]
    fn everything_null_is_empty_not_a_chart_of_zeroes() {
        assert!(matches!(
            numerical(&ids(), [&[], &[]], false),
            Distribution::Empty
        ));
        assert!(matches!(
            categorical(&ids(), [&HashMap::new(), &HashMap::new()]),
            Distribution::Empty
        ));
    }

    /// Milliseconds spanning four orders of magnitude, the shape a real
    /// duration has: a crowd near zero and a thin tail out to hours.
    fn skewed() -> Vec<f64> {
        let mut values: Vec<f64> = (0..90).map(|i| (i % 30) as f64 * 1_000.0).collect();
        values.extend([600_000.0, 900_000.0, 3_600_000.0, 7_200_000.0]);
        values
    }

    #[test]
    fn only_durations_carry_a_shape() {
        let values = skewed();
        let Distribution::Numerical { shape, .. } = numerical(&ids(), [&values, &values], false)
        else {
            panic!("expected a numerical distribution");
        };
        assert!(shape.is_none());
        let Distribution::Numerical { shape, .. } = numerical(&ids(), [&values, &values], true)
        else {
            panic!("expected a numerical distribution");
        };
        assert!(shape.is_some());
    }

    #[test]
    fn the_ecdf_is_one_value_per_percentile_and_never_goes_backwards() {
        let ladder = ecdf(&{
            let mut sorted = skewed();
            sorted.sort_by(|x, y| x.partial_cmp(y).unwrap());
            sorted
        });
        assert_eq!(ladder.len(), ECDF_STEPS + 1);
        assert!(ladder.windows(2).all(|pair| pair[1] >= pair[0]));
        // The ends are the sample's own extremes, not interpolated past them.
        assert_eq!(ladder[0], 0.0);
        assert_eq!(*ladder.last().unwrap(), 7_200_000.0);
    }

    #[test]
    fn a_group_with_no_values_has_no_curve_and_no_box() {
        assert!(ecdf(&[]).is_empty());
        assert!(box_stats(&[]).is_none());
    }

    #[test]
    fn whiskers_stop_at_observations_and_the_rest_are_counted() {
        // Tight body, one value far out: the high whisker stays on the body's
        // own last value.
        let sorted = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 1_000.0];
        let stats = box_stats(&sorted).expect("values");
        assert_eq!(stats.min, 1.0);
        assert_eq!(stats.max, 1_000.0);
        assert_eq!(stats.whisker_high, 9.0);
        assert_eq!(stats.outliers_high, 1);
        assert_eq!(stats.outliers_low, 0);
        assert!(stats.q1 < stats.median && stats.median < stats.q3);
    }

    #[test]
    fn a_flat_middle_falls_back_to_percentiles_instead_of_calling_everything_an_outlier() {
        // The shape a Transition Time takes: most cases at zero, the rest long.
        // Tukey's fences collapse onto zero here, so the 1.5·IQR rule would call
        // every non-zero case an outlier and leave nothing to draw.
        let mut sorted = vec![0.0; 800];
        sorted.extend((1..=200).map(|i| i as f64 * 10.0));
        let stats = box_stats(&sorted).expect("values");
        assert_eq!((stats.q1, stats.median, stats.q3), (0.0, 0.0, 0.0));
        assert_eq!(stats.whisker_low, 0.0);
        assert!(
            stats.whisker_high > 0.0,
            "the whisker has to leave the floor"
        );
        // A fraction of the sample, not a fifth of it.
        assert!(
            stats.outliers_high < sorted.len() / 20,
            "{} of {} called outliers",
            stats.outliers_high,
            sorted.len()
        );
    }

    #[test]
    fn a_truly_constant_sample_still_has_no_spread_and_no_outliers() {
        let stats = box_stats(&[5.0; 50]).expect("values");
        assert_eq!((stats.whisker_low, stats.whisker_high), (5.0, 5.0));
        assert_eq!((stats.outliers_low, stats.outliers_high), (0, 0));
    }

    #[test]
    fn a_sample_inside_its_fences_whiskers_to_its_own_extremes() {
        let sorted = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let stats = box_stats(&sorted).expect("values");
        assert_eq!((stats.whisker_low, stats.whisker_high), (1.0, 5.0));
        assert_eq!((stats.outliers_low, stats.outliers_high), (0, 0));
    }

    #[test]
    fn log_bins_start_at_zero_hold_every_value_and_stay_readable() {
        let mut sorted = skewed();
        sorted.sort_by(|x, y| x.partial_cmp(y).unwrap());
        let max = *sorted.last().unwrap();
        let edges = log_edges(max);
        assert_eq!(edges[0], 0.0, "a duration of nothing needs a bin");
        assert!(edges.len() - 1 <= MAX_LOG_BINS);
        assert!(edges.windows(2).all(|pair| pair[1] > pair[0]), "{edges:?}");
        let counts = bin_by_edges(&sorted, &edges);
        assert_eq!(counts.iter().sum::<i64>(), sorted.len() as i64);
        // The maximum lands in the last bin.
        assert!(*counts.last().unwrap() > 0);
    }

    #[test]
    fn a_long_range_coarsens_the_ladder_rather_than_inventing_edges() {
        let edges = log_edges(2_592_000_000.0);
        assert!(edges.len() - 1 <= MAX_LOG_BINS, "{edges:?}");
        // Every interior edge is still a rung the ladder wrote down.
        for edge in &edges[1..edges.len() - 1] {
            assert!(DURATION_EDGES.contains(edge), "{edge} is not a ladder rung");
        }
    }
}

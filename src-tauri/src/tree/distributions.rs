//! Distributions — the value counts behind one node's charts, queried per
//! selected node rather than shipped with the build. See
//! `docs/adr/0003-query-distributions-on-demand.md` for why this one thing
//! doesn't travel in the tree payload like everything else does.
//!
//! A node is named by the Variant keys of the leaves in its subtree plus its
//! depth, which is the build's own currency — so nothing here re-derives node
//! identity by joining activity labels, and the terminal/non-terminal split
//! that `(parent, activity, terminates-here)` encodes comes along for free.

use super::stats::{quantile, tukey};
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

/// Percentiles the ECDF ladder is sampled at, 0 through 100 inclusive. One per
/// percent is finer than a card is wide, so the curve is exact as drawn while
/// staying two hundred floats rather than the hundred thousand values behind it.
const ECDF_STEPS: usize = 100;

/// The coarsest a log-bin ladder may get before it stops being readable.
const MAX_LOG_BINS: usize = 8;

/// Boundaries a person would actually pick for a duration, in milliseconds.
///
/// Time is not decimal, so a geometric ladder computed from the data lands on
/// edges like "1m47s" that read as noise. Durations are the only attributes
/// binned this way and their units are fixed, so the ladder is written down.
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

/// A Group's five-number summary with Tukey whiskers, for the box plot.
///
/// The whiskers are the extreme values still inside 1.5·IQR — actual
/// observations, not the fences themselves. The points beyond them are counted
/// rather than shipped: on a heavy tail they run to thousands, and a card that
/// small says "412 above" more usefully than it draws 412 dots.
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
/// Durations are heavily right-skewed: most of the mass in the first bin and a
/// tail running orders of magnitude out. Equal-width bins spend their whole
/// budget on empty range, which is why these are computed here — none of them
/// can be recovered from binned counts after the fact.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DurationShape {
    /// Value at percentile `i` for `i` in `0..=ECDF_STEPS` — the ECDF, with the
    /// percentile left implicit in the index. Empty for a Group with no values.
    pub ecdf_a: Vec<f64>,
    pub ecdf_b: Vec<f64>,
    pub box_a: Option<BoxStats>,
    pub box_b: Option<BoxStats>,
    /// Log-ish bin edges shared by both Groups, so the two series are read
    /// against each other. `log_edges.len() == log_counts_a.len() + 1`.
    pub log_edges: Vec<f64>,
    pub log_counts_a: Vec<i64>,
    pub log_counts_b: Vec<i64>,
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
        /// Set for Activity Duration and Transition Time only; `None` says the
        /// card has nothing but the equal-width bins to draw.
        shape: Option<DurationShape>,
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

/// The value at each percentile from 0 to 100. Empty in, empty out — a Group
/// absent from this node has no curve rather than a flat line at zero.
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
/// Zero is always the first edge: a duration of nothing is common — an activity
/// with one timestamp, a transition into the step it follows — and the log of
/// it does not exist, so the first bin is "under the first boundary" rather
/// than a bin the ladder has to reach down to.
fn log_edges(max: f64) -> Vec<f64> {
    let within: Vec<f64> = DURATION_EDGES.iter().copied().filter(|e| *e < max).collect();
    // Coarsening by stride keeps the ladder's own boundaries rather than
    // inventing new ones: every other rung is still a rung. `n` rungs make
    // `n + 1` bins once the leading "under the first rung" bin is counted, so
    // the budget the stride divides is one short of the ceiling.
    let stride = within.len().div_ceil(MAX_LOG_BINS - 1).max(1);
    let mut edges = vec![0.0];
    edges.extend(within.iter().step_by(stride));
    // The last bin is closed on the data's own maximum, so the tail has an end
    // to be drawn against rather than running off the ladder.
    edges.push(if max > *edges.last().unwrap_or(&0.0) { max } else { max + 1.0 });
    edges
}

/// Counts into bins the edges name outright, rather than by dividing a range —
/// the log ladder's bins are deliberately unequal.
fn bin_by_edges(values: &[f64], edges: &[f64]) -> Vec<i64> {
    let bins = edges.len() - 1;
    let mut counts = vec![0i64; bins];
    for &value in values {
        // The last bin is closed so the maximum lands in it rather than past
        // the end; `partition_point` gives the first edge strictly above.
        let index = edges.partition_point(|edge| *edge <= value).saturating_sub(1);
        counts[index.min(bins - 1)] += 1;
    }
    counts
}

/// The three duration-only encodings, computed from the sorted values in hand.
fn duration_shape(sorted_a: &[f64], sorted_b: &[f64], max: f64) -> DurationShape {
    let edges = log_edges(max);
    DurationShape {
        ecdf_a: ecdf(sorted_a),
        ecdf_b: ecdf(sorted_b),
        box_a: box_stats(sorted_a),
        box_b: box_stats(sorted_b),
        log_counts_a: bin_by_edges(sorted_a, &edges),
        log_counts_b: bin_by_edges(sorted_b, &edges),
        log_edges: edges,
    }
}

fn numerical(a: &[f64], b: &[f64], duration: bool) -> Distribution {
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

    // Sorted per Group only where a duration asks for it: the quantile ladder
    // and the whiskers both need order, and nothing else here does.
    let shape = duration.then(|| {
        let sorted = |values: &[f64]| {
            let mut own: Vec<f64> = values.iter().copied().filter(|v| v.is_finite()).collect();
            own.sort_by(|x, y| x.partial_cmp(y).unwrap_or(std::cmp::Ordering::Equal));
            own
        };
        duration_shape(&sorted(a), &sorted(b), max)
    });

    Distribution::Numerical {
        counts_a: bin(a, &edges),
        counts_b: bin(b, &edges),
        n_a: a.len(),
        n_b: b.len(),
        edges,
        shape,
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
            let duration = plan.name == ACTIVITY_DURATION || plan.name == TRANSITION_TIME;
            let distribution = match (a, b) {
                (Acc::Num(a), Acc::Num(b)) => numerical(a, b, duration),
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
        } = numerical(&a, &b, false)
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
        let Distribution::Numerical { counts_a, .. } = numerical(&[7.0, 7.0, 7.0], &[], false) else {
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
        assert!(matches!(numerical(&[], &[], false), Distribution::Empty));
        assert!(matches!(
            categorical(&HashMap::new(), &HashMap::new()),
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
        let Distribution::Numerical { shape, .. } = numerical(&values, &values, false) else {
            panic!("expected a numerical distribution");
        };
        assert!(shape.is_none());
        let Distribution::Numerical { shape, .. } = numerical(&values, &values, true) else {
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
        // own last value rather than reaching up to the outlier.
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
        // The maximum lands in the last bin rather than off the end.
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

//! Filters narrow an Event Log to a Slice. A chain is an ordered AND pipeline:
//! each filter applies to the previous one's output, so order is user-visible
//! and matters (an event-level trim before an endpoint filter gives a different
//! result than after).
//!
//! Every filter is evaluated as an event-level predicate lifted to the case
//! level by a window over the case column — that lift is what the `mode` picks.

pub mod commands;

use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use polars::prelude::*;

/// How an event-level predicate is lifted to whole cases.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttributeMode {
    /// Keep cases with at least one matching event. Retained cases stay whole.
    Mandatory,
    /// Drop cases with at least one matching event. Survivors stay whole.
    Forbidden,
    /// Event-level: surviving cases keep only matching events, so their variant
    /// becomes a sub-sequence of the original.
    KeepSelected,
}

/// Numeric filters are always case-level "at least one event satisfies"; the
/// mode picks the comparison instead of the lift.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NumericMode {
    /// `value >= min`
    Above,
    /// `value <= max`
    Below,
    /// `min <= value <= max` — limits included.
    Between,
    /// `value < min || value > max` — limits excluded.
    Outside,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimeframeMode {
    /// Case has at least one event inside the window.
    Intersects,
    /// Case has no event inside the window.
    Disjoint,
    /// Case starts and ends inside the window.
    Contained,
    /// Event-level: keep only the events inside the window.
    Trim,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EndpointMode {
    Mandatory,
    Forbidden,
}

/// Whether a reference event is followed by a follower event, and how closely.
/// The two negatives are exact complements of the two positives — a case with
/// no reference event at all satisfies them, so a mode and its negation
/// partition the log rather than leaving cases in neither slice.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FollowerMode {
    /// A follower event occurs anywhere after a reference event.
    Eventually,
    /// A follower event is the very next event after a reference event.
    Directly,
    NeverEventually,
    NeverDirectly,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Endpoint {
    Start,
    End,
}

#[derive(serde::Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Filter {
    Attribute {
        column: String,
        mode: AttributeMode,
        values: Vec<String>,
    },
    Numeric {
        column: String,
        mode: NumericMode,
        min: Option<f64>,
        max: Option<f64>,
    },
    /// `from`/`to` are epoch milliseconds — the frontend already holds
    /// timestamps as numbers, so no date parsing is needed on this side.
    Timeframe {
        mode: TimeframeMode,
        from: i64,
        to: i64,
    },
    Endpoint {
        position: Endpoint,
        mode: EndpointMode,
        activities: Vec<String>,
    },
    /// `min`/`max` are days and may be fractional — the editor brushes them off
    /// the duration histogram. Duration is a case's last event minus its first.
    Duration {
        mode: NumericMode,
        min: Option<f64>,
        max: Option<f64>,
    },
    /// One column read twice: a case matches when *some* event holding a
    /// `reference` value is followed by *some* event holding a `follower` one.
    Follower {
        column: String,
        mode: FollowerMode,
        reference: Vec<String>,
        follower: Vec<String>,
    },
}

/// `value` is one of `values`. Built as an OR chain rather than `is_in` so the
/// expression is independent of Polars' shifting `is_in` signature.
fn matches_any_of(value: Expr, values: &[String]) -> Expr {
    values.iter().fold(lit(false), |acc, v| {
        acc.or(value.clone().eq(lit(v.as_str())))
    })
}

fn matches_any(column: &str, values: &[String]) -> Expr {
    matches_any_of(col(column), values)
}

fn timestamp_millis(column: &str) -> Expr {
    col(column).cast(DataType::Datetime(TimeUnit::Milliseconds, None))
}

fn numeric_predicate(value: Expr, mode: NumericMode, min: Option<f64>, max: Option<f64>) -> Expr {
    match mode {
        NumericMode::Above => match min {
            Some(m) => value.gt_eq(lit(m)),
            None => lit(true),
        },
        NumericMode::Below => match max {
            Some(m) => value.lt_eq(lit(m)),
            None => lit(true),
        },
        NumericMode::Between => match (min, max) {
            (Some(lo), Some(hi)) => value.clone().gt_eq(lit(lo)).and(value.lt_eq(lit(hi))),
            (Some(lo), None) => value.gt_eq(lit(lo)),
            (None, Some(hi)) => value.lt_eq(lit(hi)),
            (None, None) => lit(true),
        },
        NumericMode::Outside => match (min, max) {
            (Some(lo), Some(hi)) => value.clone().lt(lit(lo)).or(value.gt(lit(hi))),
            (Some(lo), None) => value.lt(lit(lo)),
            (None, Some(hi)) => value.gt(lit(hi)),
            (None, None) => lit(true),
        },
    }
}

/// Applies one filter. `case_col` drives every case-level lift; `activity_col`
/// and `timestamp_col` serve the endpoint and timeframe kinds. Fallible only
/// because Polars' `over` is — the filters themselves cannot fail here.
fn apply_one(
    lf: LazyFrame,
    filter: &Filter,
    case_col: &str,
    activity_col: &str,
    timestamp_col: &str,
) -> Result<LazyFrame, String> {
    /// Lifts an event-level predicate to "every / at least one event of the
    /// case satisfies it".
    fn per_case(predicate: Expr, case_col: &str, all: bool) -> Result<Expr, String> {
        let quantified = if all {
            predicate.all(true)
        } else {
            predicate.any(true)
        };
        quantified.over([col(case_col)]).map_err(|e| e.to_string())
    }

    Ok(match filter {
        Filter::Attribute {
            column,
            mode,
            values,
        } => {
            let hit = matches_any(column, values);
            match mode {
                AttributeMode::Mandatory => lf.filter(per_case(hit, case_col, false)?),
                AttributeMode::Forbidden => lf.filter(per_case(hit, case_col, false)?.not()),
                AttributeMode::KeepSelected => lf.filter(hit),
            }
        }
        Filter::Numeric {
            column,
            mode,
            min,
            max,
        } => {
            let value = col(column).cast(DataType::Float64);
            let hit = numeric_predicate(value, *mode, *min, *max);
            lf.filter(per_case(hit, case_col, false)?)
        }
        Filter::Timeframe { mode, from, to } => {
            let ts = timestamp_millis(timestamp_col).cast(DataType::Int64);
            let inside = ts.clone().gt_eq(lit(*from)).and(ts.lt_eq(lit(*to)));
            match mode {
                TimeframeMode::Intersects => lf.filter(per_case(inside, case_col, false)?),
                TimeframeMode::Disjoint => lf.filter(per_case(inside, case_col, false)?.not()),
                // Every event inside the window ⇒ the case's whole lifetime is.
                TimeframeMode::Contained => lf.filter(per_case(inside, case_col, true)?),
                TimeframeMode::Trim => lf.filter(inside),
            }
        }
        Filter::Endpoint {
            position,
            mode,
            activities,
        } => {
            // Rows are persisted sorted by (case, timestamp) at Event Log
            // creation and filtering preserves order, so first/last over the
            // case window are the case's endpoints without re-sorting.
            // Compared as text: the activities arrive as the display strings
            // the picker showed, and an activity column of numeric codes is
            // stored as a number, which would fail the comparison outright.
            let as_text = col(activity_col).cast(DataType::String);
            let endpoint = match position {
                Endpoint::Start => as_text.first(),
                Endpoint::End => as_text.last(),
            }
            .over([col(case_col)])
            .map_err(|e| e.to_string())?;
            let hit = activities.iter().fold(lit(false), |acc, a| {
                acc.or(endpoint.clone().eq(lit(a.as_str())))
            });
            match mode {
                EndpointMode::Mandatory => lf.filter(hit),
                EndpointMode::Forbidden => lf.filter(hit.not()),
            }
        }
        Filter::Duration { mode, min, max } => {
            // Rows are sorted by (case, timestamp), so last - first over the
            // case window is its lifetime without re-sorting (see the endpoint
            // filter above). The result is already one scalar per case,
            // broadcast to every row of it, so no further per-case lift is
            // needed before filtering.
            let ts = timestamp_millis(timestamp_col).cast(DataType::Int64);
            let span_millis = (ts.clone().last() - ts.first())
                .over([col(case_col)])
                .map_err(|e| e.to_string())?;
            let duration_days = span_millis.cast(DataType::Float64) / lit(86_400_000.0);
            lf.filter(numeric_predicate(duration_days, *mode, *min, *max))
        }
        Filter::Follower {
            column,
            mode,
            reference,
            follower,
        } => {
            // Compared as text for the same reason the endpoint filter does: the
            // values arrive as the display strings the picker showed, and a
            // column of numeric codes is stored as a number.
            let as_text = col(column).cast(DataType::String);
            let is_reference = matches_any_of(as_text.clone(), reference);
            let is_follower = matches_any_of(as_text, follower);

            // Rows are persisted sorted by (case, timestamp) and filtering
            // preserves order, so "earlier in the case" is "earlier in the
            // window" without re-sorting.
            let pair = match mode {
                FollowerMode::Eventually | FollowerMode::NeverEventually => {
                    // A running count of reference events, minus this row's own
                    // contribution: positive means one came strictly before.
                    let counted = is_reference.clone().cast(DataType::Int32);
                    let before = (counted.clone().cum_sum(false) - counted)
                        .over([col(case_col)])
                        .map_err(|e| e.to_string())?;
                    is_follower.and(before.gt(lit(0)))
                }
                FollowerMode::Directly | FollowerMode::NeverDirectly => {
                    // The first row of a case shifts in a null, which is not a
                    // reference event.
                    let previous = is_reference
                        .shift(lit(1))
                        .over([col(case_col)])
                        .map_err(|e| e.to_string())?;
                    is_follower.and(previous.fill_null(lit(false)))
                }
            };

            let matched = per_case(pair, case_col, false)?;
            match mode {
                FollowerMode::Eventually | FollowerMode::Directly => lf.filter(matched),
                FollowerMode::NeverEventually | FollowerMode::NeverDirectly => {
                    lf.filter(matched.not())
                }
            }
        }
    })
}

/// Applies a whole chain in order. An empty chain is the identity, which is how
/// callers ask for the whole log.
pub fn apply(
    lf: LazyFrame,
    filters: &[Filter],
    mapping: &[ColumnMapping],
) -> Result<LazyFrame, String> {
    let case_col = require_role(mapping, ColumnRole::CaseId)?.to_string();
    let activity_col = require_role(mapping, ColumnRole::ActivityName)?.to_string();
    let timestamp_col = require_role(mapping, ColumnRole::CompleteTimestamp)?.to_string();

    filters.iter().try_fold(lf, |acc, f| {
        apply_one(acc, f, &case_col, &activity_col, &timestamp_col)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id"},
              {"name":"act","role":"activity_name"},
              {"name":"ts","role":"complete_timestamp"}
            ]"#,
        )
        .unwrap()
    }

    /// case 1: A(Gold,10) → B(Gold,50)
    /// case 2: A(Silver,20) → C(Gold,30)
    /// case 3: B(Bronze,90)
    /// Timestamps are ms since epoch: 0, 1000, 2000, 3000, 4000.
    fn log() -> DataFrame {
        let ts = Column::new("ts".into(), [0i64, 1_000, 2_000, 3_000, 4_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        DataFrame::new(
            5,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3"]),
                Column::new("act".into(), ["A", "B", "A", "C", "B"]),
                ts,
                Column::new("type".into(), ["Gold", "Gold", "Silver", "Gold", "Bronze"]),
                Column::new("amount".into(), [10i64, 50, 20, 30, 90]),
            ],
        )
        .unwrap()
    }

    fn run(filters: &[Filter]) -> DataFrame {
        apply(log().lazy(), filters, &mapping())
            .unwrap()
            .collect()
            .unwrap()
    }

    fn cases(df: &DataFrame) -> Vec<String> {
        let mut out: Vec<String> = df
            .column("case")
            .unwrap()
            .str()
            .unwrap()
            .iter()
            .flatten()
            .map(str::to_string)
            .collect();
        out.dedup();
        out
    }

    fn parse(json: &str) -> Vec<Filter> {
        serde_json::from_str(json).expect("filter payload should deserialize")
    }

    #[test]
    fn empty_chain_is_the_whole_log() {
        assert_eq!(run(&[]).height(), 5);
    }

    #[test]
    fn mandatory_keeps_matching_cases_whole() {
        // Case 2 has one Silver event; its Gold event survives with it.
        let df = run(&parse(
            r#"[{"kind":"attribute","column":"type","mode":"mandatory","values":["Silver"]}]"#,
        ));
        assert_eq!(cases(&df), ["2"]);
        assert_eq!(
            df.height(),
            2,
            "the whole case is retained, not just the hit"
        );
    }

    #[test]
    fn forbidden_drops_matching_cases_whole() {
        let df = run(&parse(
            r#"[{"kind":"attribute","column":"type","mode":"forbidden","values":["Silver"]}]"#,
        ));
        assert_eq!(cases(&df), ["1", "3"]);
    }

    #[test]
    fn keep_selected_trims_events_and_leaves_partial_cases() {
        let df = run(&parse(
            r#"[{"kind":"attribute","column":"type","mode":"keep_selected","values":["Gold"]}]"#,
        ));
        assert_eq!(cases(&df), ["1", "2"]);
        // Case 2 keeps only its Gold event — the trace is now a sub-sequence.
        assert_eq!(df.height(), 3);
    }

    #[test]
    fn numeric_between_includes_the_limits() {
        let df = run(&parse(
            r#"[{"kind":"numeric","column":"amount","mode":"between","min":10,"max":20}]"#,
        ));
        // Case 1 (10) and case 2 (20) each have an event on a limit.
        assert_eq!(cases(&df), ["1", "2"]);
    }

    /// A log whose activities are numeric codes. The declared type is honoured
    /// at ingest, so the column really is an i64 here — the endpoint filter still
    /// has to match the picker's "10" against it.
    #[test]
    fn endpoint_filter_reads_a_numeric_activity_column_as_text() {
        let ts = Column::new("ts".into(), [0i64, 1_000, 2_000, 3_000, 4_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        let df = DataFrame::new(
            5,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3"]),
                ts,
                Column::new("act_num".into(), [10i64, 20, 10, 30, 20]),
            ],
        )
        .unwrap();
        let numeric_activity: Vec<ColumnMapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id"},
              {"name":"act_num","role":"activity_name","type":"integer"},
              {"name":"ts","role":"complete_timestamp"}
            ]"#,
        )
        .unwrap();
        let out = apply(
            df.lazy(),
            &parse(
                r#"[{"kind":"endpoint","position":"start","mode":"mandatory","activities":["10"]}]"#,
            ),
            &numeric_activity,
        )
        .unwrap()
        .collect()
        .expect("a numeric activity column must not fail the comparison");
        assert_eq!(cases(&out), ["1", "2"]);
    }

    /// The attribute picker offers text and boolean columns only, and Polars
    /// coerces the literal for the boolean one — so no cast is needed there.
    #[test]
    fn attribute_filter_matches_a_boolean_column() {
        let ts = Column::new("ts".into(), [0i64, 1_000, 2_000, 3_000, 4_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        let df = DataFrame::new(
            5,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3"]),
                Column::new("act".into(), ["A", "B", "A", "C", "B"]),
                ts,
                Column::new("flag".into(), [true, true, false, false, true]),
            ],
        )
        .unwrap();
        let out = apply(
            df.lazy(),
            &parse(
                r#"[{"kind":"attribute","column":"flag","mode":"mandatory","values":["true"]}]"#,
            ),
            &mapping(),
        )
        .unwrap()
        .collect()
        .unwrap();
        assert_eq!(cases(&out), ["1", "3"]);
    }

    #[test]
    fn numeric_outside_excludes_the_limits() {
        let df = run(&parse(
            r#"[{"kind":"numeric","column":"amount","mode":"outside","min":10,"max":20}]"#,
        ));
        // 10 and 20 are not outside; only 50, 30 and 90 are.
        assert_eq!(cases(&df), ["1", "2", "3"]);
    }

    #[test]
    fn numeric_above_and_below_use_one_bound() {
        let above = run(&parse(
            r#"[{"kind":"numeric","column":"amount","mode":"above","min":50}]"#,
        ));
        assert_eq!(cases(&above), ["1", "3"]);
        let below = run(&parse(
            r#"[{"kind":"numeric","column":"amount","mode":"below","max":20}]"#,
        ));
        assert_eq!(cases(&below), ["1", "2"]);
    }

    #[test]
    fn timeframe_distinguishes_intersecting_from_contained() {
        // Window covers ts 1000..2500 — case 1 straddles it, case 2 does too.
        let intersects = run(&parse(
            r#"[{"kind":"timeframe","mode":"intersects","from":1000,"to":2500}]"#,
        ));
        assert_eq!(cases(&intersects), ["1", "2"]);
        // Nothing is fully inside that window, but case 1 is inside 0..1000.
        assert!(cases(&run(&parse(
            r#"[{"kind":"timeframe","mode":"contained","from":1000,"to":2500}]"#
        )))
        .is_empty());
        let contained = run(&parse(
            r#"[{"kind":"timeframe","mode":"contained","from":0,"to":1000}]"#,
        ));
        assert_eq!(cases(&contained), ["1"]);
    }

    #[test]
    fn timeframe_disjoint_and_trim() {
        let disjoint = run(&parse(
            r#"[{"kind":"timeframe","mode":"disjoint","from":0,"to":1000}]"#,
        ));
        assert_eq!(cases(&disjoint), ["2", "3"]);
        let trim = run(&parse(
            r#"[{"kind":"timeframe","mode":"trim","from":1000,"to":3000}]"#,
        ));
        assert_eq!(trim.height(), 3);
    }

    #[test]
    fn endpoint_matches_the_cases_first_and_last_activity() {
        let starts = run(&parse(
            r#"[{"kind":"endpoint","position":"start","mode":"mandatory","activities":["A"]}]"#,
        ));
        assert_eq!(cases(&starts), ["1", "2"]);
        let ends = run(&parse(
            r#"[{"kind":"endpoint","position":"end","mode":"mandatory","activities":["B"]}]"#,
        ));
        assert_eq!(cases(&ends), ["1", "3"]);
        let not_starting_with_a = run(&parse(
            r#"[{"kind":"endpoint","position":"start","mode":"forbidden","activities":["A"]}]"#,
        ));
        assert_eq!(cases(&not_starting_with_a), ["3"]);
    }

    /// The pipeline is ordered: a trim changes what a later endpoint filter
    /// sees. Trimming case 2 down to its Gold event makes it *end* with C.
    #[test]
    fn chain_order_changes_the_result() {
        let trim_then_endpoint = run(&parse(
            r#"[
              {"kind":"attribute","column":"type","mode":"keep_selected","values":["Gold"]},
              {"kind":"endpoint","position":"end","mode":"mandatory","activities":["C"]}
            ]"#,
        ));
        assert_eq!(cases(&trim_then_endpoint), ["2"]);

        let endpoint_then_trim = run(&parse(
            r#"[
              {"kind":"endpoint","position":"end","mode":"mandatory","activities":["C"]},
              {"kind":"attribute","column":"type","mode":"keep_selected","values":["Gold"]}
            ]"#,
        ));
        // Same surviving case here, but reached the other way round — and the
        // trace differs from applying the endpoint filter to the trimmed log.
        assert_eq!(cases(&endpoint_then_trim), ["2"]);
        assert_eq!(endpoint_then_trim.height(), 1);
    }

    #[test]
    fn a_chain_can_empty_the_log() {
        let df = run(&parse(
            r#"[{"kind":"attribute","column":"type","mode":"mandatory","values":["Platinum"]}]"#,
        ));
        assert_eq!(df.height(), 0);
    }

    const DAY_MS: i64 = 86_400_000;

    /// case 1: spans exactly 30 days. case 2: spans 15 days. case 3: a single
    /// event, so 0 days. case 4: spans 45 days.
    fn duration_log() -> DataFrame {
        let ts = Column::new(
            "ts".into(),
            [0i64, 30 * DAY_MS, 0, 15 * DAY_MS, 0, 0, 45 * DAY_MS],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .unwrap();
        DataFrame::new(
            7,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3", "4", "4"]),
                Column::new("act".into(), ["A", "B", "A", "B", "A", "A", "B"]),
                ts,
            ],
        )
        .unwrap()
    }

    fn run_duration(filters: &[Filter]) -> DataFrame {
        apply(duration_log().lazy(), filters, &mapping())
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn duration_between_includes_the_limits() {
        // 30 and 0 are on the limits, 15 is inside; 45 is outside.
        let df = run_duration(&parse(
            r#"[{"kind":"duration","mode":"between","min":0,"max":30}]"#,
        ));
        assert_eq!(cases(&df), ["1", "2", "3"]);
    }

    #[test]
    fn duration_outside_excludes_the_limits() {
        let df = run_duration(&parse(
            r#"[{"kind":"duration","mode":"outside","min":0,"max":30}]"#,
        ));
        assert_eq!(cases(&df), ["4"]);
    }

    #[test]
    fn duration_above_and_below_use_one_bound() {
        let above = run_duration(&parse(r#"[{"kind":"duration","mode":"above","min":40}]"#));
        assert_eq!(cases(&above), ["4"]);
        let below = run_duration(&parse(r#"[{"kind":"duration","mode":"below","max":0}]"#));
        assert_eq!(cases(&below), ["3"]);
    }

    /// case 1: A → X → B  (B follows A, but not directly)
    /// case 2: A → B      (directly)
    /// case 3: B → A      (the follower comes first, so no pair at all)
    /// case 4: X → Y      (no reference event whatsoever)
    fn follower_log() -> DataFrame {
        let ts = Column::new("ts".into(), [0i64, 1_000, 2_000, 0, 1_000, 0, 1_000, 0, 1_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        DataFrame::new(
            9,
            vec![
                Column::new(
                    "case".into(),
                    ["1", "1", "1", "2", "2", "3", "3", "4", "4"],
                ),
                Column::new("act".into(), ["A", "X", "B", "A", "B", "B", "A", "X", "Y"]),
                ts,
            ],
        )
        .unwrap()
    }

    fn run_follower(mode: &str) -> Vec<String> {
        let filters = parse(&format!(
            r#"[{{"kind":"follower","column":"act","mode":"{mode}","reference":["A"],"follower":["B"]}}]"#
        ));
        let df = apply(follower_log().lazy(), &filters, &mapping())
            .unwrap()
            .collect()
            .unwrap();
        cases(&df)
    }

    #[test]
    fn eventually_followed_accepts_a_gap_that_directly_followed_rejects() {
        assert_eq!(run_follower("eventually"), ["1", "2"]);
        assert_eq!(run_follower("directly"), ["2"]);
    }

    #[test]
    fn the_never_modes_are_the_exact_complement_and_keep_cases_without_a_reference() {
        // Case 3 has both values but in the wrong order; case 4 has no A at all.
        assert_eq!(run_follower("never_eventually"), ["3", "4"]);
        assert_eq!(run_follower("never_directly"), ["1", "3", "4"]);
    }

    #[test]
    fn a_follower_pair_is_looked_for_within_one_case_only() {
        // Case 3's A is last, so the B of no later case may pair with it.
        let filters = parse(
            r#"[{"kind":"follower","column":"act","mode":"eventually","reference":["A"],"follower":["B"]}]"#,
        );
        let df = apply(follower_log().lazy(), &filters, &mapping())
            .unwrap()
            .collect()
            .unwrap();
        assert!(!cases(&df).contains(&"3".to_string()));
    }
}

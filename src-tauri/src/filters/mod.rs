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
}

/// `column` is one of `values`. Built as an OR chain rather than `is_in` so the
/// expression is independent of Polars' shifting `is_in` signature.
fn matches_any(column: &str, values: &[String]) -> Expr {
    values.iter().fold(lit(false), |acc, v| {
        acc.or(col(column).eq(lit(v.as_str())))
    })
}

fn timestamp_millis(column: &str) -> Expr {
    col(column).cast(DataType::Datetime(TimeUnit::Milliseconds, None))
}

fn numeric_predicate(column: &str, mode: NumericMode, min: Option<f64>, max: Option<f64>) -> Expr {
    let value = col(column).cast(DataType::Float64);
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
            let hit = numeric_predicate(column, *mode, *min, *max);
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
            let endpoint = match position {
                Endpoint::Start => col(activity_col).first(),
                Endpoint::End => col(activity_col).last(),
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
        assert_eq!(df.height(), 2, "the whole case is retained, not just the hit");
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
}

//! Filters narrow an Event Log to a Group. A Filter List is an ordered AND
//! pipeline: each filter applies to the previous one's output, so order matters.
//! Each kind lives in its own module; this file dispatches and folds a chain.

mod attribute;
pub mod commands;
mod duration;
mod endpoint;
mod enums;
mod follower;
mod group_membership;
mod numeric;
mod predicates;
pub(crate) mod queries;
mod structs;
mod timeframe;

pub use enums::{Endpoint, Filter};
pub(crate) use predicates::timestamp_millis;

use crate::column_mapping::{case_resolution, require_role, ColumnMapping, ColumnRole};
use polars::prelude::*;
use std::collections::{HashMap, HashSet};

/// Case ids to exclude, by Group id. Resolved before a Filter List runs:
/// `case_not_in_group` reads another Group's file, not the current frame.
pub type ExcludedCases = HashMap<String, HashSet<String>>;

/// Applies one filter. `case_col` drives every case-level lift.
fn apply_one(
    lf: LazyFrame,
    filter: &Filter,
    case_col: &str,
    activity_col: &str,
    timestamp_col: &str,
    mapping: &[ColumnMapping],
    excluded: &ExcludedCases,
) -> Result<LazyFrame, String> {
    match filter {
        Filter::Attribute {
            column,
            mode,
            values,
        } => attribute::apply(
            lf,
            column,
            *mode,
            values,
            case_resolution(mapping, column),
            case_col,
        ),
        Filter::Numeric {
            column,
            mode,
            min,
            max,
        } => numeric::apply(
            lf,
            column,
            *mode,
            *min,
            *max,
            case_resolution(mapping, column),
            case_col,
        ),
        Filter::Timeframe { mode, from, to } => {
            timeframe::apply(lf, *mode, *from, *to, case_col, timestamp_col)
        }
        Filter::Endpoint {
            position,
            mode,
            activities,
        } => endpoint::apply(lf, *position, *mode, activities, case_col, activity_col),
        Filter::Duration { mode, min, max } => {
            duration::apply(lf, *mode, *min, *max, case_col, timestamp_col)
        }
        Filter::Follower {
            column,
            mode,
            reference,
            follower,
        } => follower::apply(lf, column, *mode, reference, follower, case_col),
        Filter::CaseNotInGroup { group_id } => group_membership::apply(
            lf,
            excluded.get(group_id).unwrap_or(&HashSet::new()),
            case_col,
        ),
    }
}

/// Applies a whole Filter List in order. An empty one is the identity.
pub fn apply(
    lf: LazyFrame,
    filters: &[Filter],
    mapping: &[ColumnMapping],
    excluded: &ExcludedCases,
) -> Result<LazyFrame, String> {
    let case_col = require_role(mapping, ColumnRole::CaseId)?.to_string();
    let activity_col = require_role(mapping, ColumnRole::ActivityName)?.to_string();
    let timestamp_col = require_role(mapping, ColumnRole::CompleteTimestamp)?.to_string();

    filters.iter().try_fold(lf, |acc, f| {
        apply_one(
            acc,
            f,
            &case_col,
            &activity_col,
            &timestamp_col,
            mapping,
            excluded,
        )
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Fixtures and helpers shared by every filter module's tests.
    pub(crate) mod support {
        use super::*;

        pub(crate) fn mapping() -> Vec<ColumnMapping> {
            serde_json::from_str(
                r#"[
                  {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
                  {"name":"act","role":"activity_name","type":"string","scope":"event"},
                  {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"}
                ]"#,
            )
            .unwrap()
        }

        /// case 1: A(Gold,10) → B(Gold,50)
        /// case 2: A(Silver,20) → C(Gold,30)
        /// case 3: B(Bronze,90)
        /// Timestamps are ms since epoch: 0, 1000, 2000, 3000, 4000.
        pub(crate) fn log() -> DataFrame {
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

        pub(crate) fn cases(df: &DataFrame) -> Vec<String> {
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

        pub(crate) fn parse(json: &str) -> Vec<Filter> {
            serde_json::from_str(json).expect("filter payload should deserialize")
        }
    }

    use support::{cases, log, mapping, parse};

    fn run(filters: &[Filter]) -> DataFrame {
        apply(log().lazy(), filters, &mapping(), &ExcludedCases::new())
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn empty_chain_is_the_whole_log() {
        assert_eq!(run(&[]).height(), 5);
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
        assert_eq!(cases(&endpoint_then_trim), ["2"]);
        assert_eq!(endpoint_then_trim.height(), 1);
    }

    /// case 1: fine 35 → 71.5 (the penalty moves it across 50), tier Silver → Gold
    /// case 2: fine 60 → 120, tier Gold → Gold
    /// case 3: fine empty → 20 → empty, tier empty → Bronze → empty
    /// case 4: fine empty, tier empty
    fn resolved_log() -> DataFrame {
        let ts = Column::new(
            "ts".into(),
            [0i64, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .unwrap();
        DataFrame::new(
            8,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3", "3", "3", "4"]),
                Column::new("act".into(), ["A", "B", "A", "B", "A", "B", "C", "A"]),
                ts,
                Column::new(
                    "fine".into(),
                    [
                        Some(35.0f64),
                        Some(71.5),
                        Some(60.0),
                        Some(120.0),
                        None,
                        Some(20.0),
                        None,
                        None,
                    ],
                ),
                Column::new(
                    "tier".into(),
                    [
                        Some("Silver"),
                        Some("Gold"),
                        Some("Gold"),
                        Some("Gold"),
                        None,
                        Some("Bronze"),
                        None,
                        None,
                    ],
                ),
            ],
        )
        .unwrap()
    }

    /// `scope` is the Column Mapping fields of both `fine` and `tier`.
    fn resolved_mapping(scope: &str) -> Vec<ColumnMapping> {
        serde_json::from_str(&format!(
            r#"[
              {{"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"}},
              {{"name":"act","role":"activity_name","type":"string","scope":"event"}},
              {{"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"}},
              {{"name":"fine","role":"other","type":"float",{scope}}},
              {{"name":"tier","role":"other","type":"string",{scope}}}
            ]"#
        ))
        .unwrap()
    }

    const EVENT: &str = r#""scope":"event""#;
    const FIRST: &str = r#""scope":"case","caseResolution":"first""#;
    const LAST: &str = r#""scope":"case","caseResolution":"last""#;
    const CONSTANT: &str = r#""scope":"case","caseResolution":"constant""#;

    fn resolved_run(scope: &str, filter: &str) -> DataFrame {
        apply(
            resolved_log().lazy(),
            &parse(&format!("[{filter}]")),
            &resolved_mapping(scope),
            &ExcludedCases::new(),
        )
        .unwrap()
        .collect()
        .unwrap()
    }

    const BELOW_50: &str =
        r#"{"kind":"numeric","column":"fine","mode":"below","min":null,"max":49.99}"#;
    const ABOVE_50: &str =
        r#"{"kind":"numeric","column":"fine","mode":"above","min":50,"max":null}"#;

    fn attribute(mode: &str, value: &str) -> String {
        format!(r#"{{"kind":"attribute","column":"tier","mode":"{mode}","values":["{value}"]}}"#)
    }

    #[test]
    fn numeric_on_a_first_column_tests_the_first_value() {
        assert_eq!(cases(&resolved_run(FIRST, BELOW_50)), ["1", "3"]);
        assert_eq!(cases(&resolved_run(FIRST, ABOVE_50)), ["2"]);
    }

    #[test]
    fn numeric_on_a_last_column_tests_the_last_value() {
        assert_eq!(cases(&resolved_run(LAST, BELOW_50)), ["3"]);
        assert_eq!(cases(&resolved_run(LAST, ABOVE_50)), ["1", "2"]);
    }

    #[test]
    fn numeric_on_a_constant_column_tests_the_first_value() {
        assert_eq!(cases(&resolved_run(CONSTANT, BELOW_50)), ["1", "3"]);
    }

    #[test]
    fn numeric_on_an_event_column_matches_any_event() {
        assert_eq!(cases(&resolved_run(EVENT, BELOW_50)), ["1", "3"]);
        assert_eq!(cases(&resolved_run(EVENT, ABOVE_50)), ["1", "2"]);
    }

    #[test]
    fn a_column_absent_from_the_mapping_matches_any_event() {
        let out = apply(
            resolved_log().lazy(),
            &parse(&format!("[{ABOVE_50}]")),
            &mapping(),
            &ExcludedCases::new(),
        )
        .unwrap()
        .collect()
        .unwrap();
        assert_eq!(cases(&out), ["1", "2"]);
    }

    #[test]
    fn groups_below_and_above_a_first_column_share_no_case() {
        let below = cases(&resolved_run(FIRST, BELOW_50));
        let above = cases(&resolved_run(FIRST, ABOVE_50));
        assert!(below.iter().all(|case| !above.contains(case)));
    }

    #[test]
    fn a_resolved_match_keeps_the_whole_case() {
        assert_eq!(resolved_run(FIRST, BELOW_50).height(), 5);
    }

    #[test]
    fn numeric_without_a_bound_keeps_every_case() {
        let unbounded =
            r#"{"kind":"numeric","column":"fine","mode":"between","min":null,"max":null}"#;
        assert_eq!(resolved_run(FIRST, unbounded).height(), 8);
    }

    #[test]
    fn a_case_with_no_value_never_matches_numeric() {
        let outside = r#"{"kind":"numeric","column":"fine","mode":"outside","min":0,"max":1}"#;
        assert_eq!(cases(&resolved_run(FIRST, outside)), ["1", "2", "3"]);
    }

    #[test]
    fn mandatory_on_a_case_column_tests_the_resolved_value() {
        assert_eq!(
            cases(&resolved_run(FIRST, &attribute("mandatory", "Silver"))),
            ["1"]
        );
        assert!(cases(&resolved_run(FIRST, &attribute("mandatory", "Platinum"))).is_empty());
        assert_eq!(
            cases(&resolved_run(LAST, &attribute("mandatory", "Gold"))),
            ["1", "2"]
        );
        assert!(cases(&resolved_run(LAST, &attribute("mandatory", "Silver"))).is_empty());
    }

    #[test]
    fn forbidden_on_a_case_column_tests_the_resolved_value_and_keeps_a_case_with_none() {
        assert_eq!(
            cases(&resolved_run(FIRST, &attribute("forbidden", "Gold"))),
            ["1", "3", "4"]
        );
        assert_eq!(
            cases(&resolved_run(LAST, &attribute("forbidden", "Gold"))),
            ["3", "4"]
        );
    }

    #[test]
    fn attribute_on_an_event_column_matches_any_event() {
        assert_eq!(
            cases(&resolved_run(EVENT, &attribute("mandatory", "Gold"))),
            ["1", "2"]
        );
        assert_eq!(
            cases(&resolved_run(EVENT, &attribute("forbidden", "Gold"))),
            ["3", "4"]
        );
    }

    #[test]
    fn keep_selected_on_a_case_column_keeps_or_drops_the_whole_case() {
        let kept = resolved_run(FIRST, &attribute("keep_selected", "Silver"));
        assert_eq!(cases(&kept), ["1"]);
        assert_eq!(kept.height(), 2);
        assert_eq!(
            resolved_run(LAST, &attribute("keep_selected", "Silver")).height(),
            0
        );
    }

    #[test]
    fn keep_selected_on_an_event_column_still_trims() {
        let kept = resolved_run(EVENT, &attribute("keep_selected", "Silver"));
        assert_eq!(cases(&kept), ["1"]);
        assert_eq!(kept.height(), 1);
    }

    /// A Filter reads the previous one's output: the trim leaves case 1 with its
    /// second event, whose 71.5 is then the first value it holds.
    #[test]
    fn a_resolved_value_is_read_from_what_the_filters_before_it_left() {
        let out = apply(
            resolved_log().lazy(),
            &parse(&format!(
                r#"[{{"kind":"timeframe","mode":"trim","from":1000,"to":3000}},{ABOVE_50}]"#
            )),
            &resolved_mapping(FIRST),
            &ExcludedCases::new(),
        )
        .unwrap()
        .collect()
        .unwrap();
        assert_eq!(cases(&out), ["1", "2"]);
    }

    #[test]
    fn a_case_column_of_booleans_resolves_too() {
        let ts = Column::new("ts".into(), [0i64, 1_000, 2_000, 3_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        let df = DataFrame::new(
            4,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2"]),
                Column::new("act".into(), ["A", "B", "A", "B"]),
                ts,
                Column::new("flag".into(), [true, false, false, true]),
            ],
        )
        .unwrap();
        let columns: Vec<ColumnMapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"act","role":"activity_name","type":"string","scope":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"},
              {"name":"flag","role":"other","type":"boolean","scope":"case","caseResolution":"first"}
            ]"#,
        )
        .unwrap();
        let out = apply(
            df.lazy(),
            &parse(
                r#"[{"kind":"attribute","column":"flag","mode":"mandatory","values":["true"]}]"#,
            ),
            &columns,
            &ExcludedCases::new(),
        )
        .unwrap()
        .collect()
        .unwrap();
        assert_eq!(cases(&out), ["1"]);
    }
}

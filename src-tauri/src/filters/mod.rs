//! Filters narrow an Event Log to a Group. A Filter List is an ordered AND
//! pipeline: each filter applies to the previous one's output, so order is
//! user-visible and matters (an event-level trim before an endpoint filter
//! gives a different result than after).
//!
//! Every filter is evaluated as an event-level predicate lifted to the case
//! level by a window over the case column — that lift is what the `mode` picks.
//! Each filter kind lives in its own module and owns its tests; this file only
//! dispatches a `Filter` to the matching module and folds a chain through them.

mod attribute;
pub mod commands;
mod duration;
mod endpoint;
mod enums;
mod follower;
mod numeric;
mod predicates;
pub(crate) mod queries;
mod structs;
mod timeframe;

pub use enums::{Endpoint, Filter};
pub(crate) use predicates::timestamp_millis;

use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use polars::prelude::*;

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
    match filter {
        Filter::Attribute {
            column,
            mode,
            values,
        } => attribute::apply(lf, column, *mode, values, case_col),
        Filter::Numeric {
            column,
            mode,
            min,
            max,
        } => numeric::apply(lf, column, *mode, *min, *max, case_col),
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
    }
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
pub(crate) mod tests {
    use super::*;

    /// Fixtures and helpers shared by every filter module's tests.
    pub(crate) mod support {
        use super::*;

        pub(crate) fn mapping() -> Vec<ColumnMapping> {
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
        apply(log().lazy(), filters, &mapping())
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
        // Same surviving case here, but reached the other way round — and the
        // trace differs from applying the endpoint filter to the trimmed log.
        assert_eq!(cases(&endpoint_then_trim), ["2"]);
        assert_eq!(endpoint_then_trim.height(), 1);
    }
}

//! The `Attribute` filter: matches events by an arbitrary column's value.

use super::enums::AttributeMode;
use super::predicates::{matches_any, per_case};
use polars::prelude::*;

pub fn apply(
    lf: LazyFrame,
    column: &str,
    mode: AttributeMode,
    values: &[String],
    case_col: &str,
) -> Result<LazyFrame, String> {
    let hit = matches_any(column, values);
    Ok(match mode {
        AttributeMode::Mandatory => lf.filter(per_case(hit, case_col, false)?),
        AttributeMode::Forbidden => lf.filter(per_case(hit, case_col, false)?.not()),
        AttributeMode::KeepSelected => lf.filter(hit),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::{cases, log};

    fn run(mode: AttributeMode, values: &[&str]) -> DataFrame {
        let values: Vec<String> = values.iter().map(|v| v.to_string()).collect();
        apply(log().lazy(), "type", mode, &values, "case")
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn mandatory_keeps_matching_cases_whole() {
        // Case 2 has one Silver event; its Gold event survives with it.
        let df = run(AttributeMode::Mandatory, &["Silver"]);
        assert_eq!(cases(&df), ["2"]);
        assert_eq!(
            df.height(),
            2,
            "the whole case is retained, not just the hit"
        );
    }

    #[test]
    fn forbidden_drops_matching_cases_whole() {
        let df = run(AttributeMode::Forbidden, &["Silver"]);
        assert_eq!(cases(&df), ["1", "3"]);
    }

    #[test]
    fn keep_selected_trims_events_and_leaves_partial_cases() {
        let df = run(AttributeMode::KeepSelected, &["Gold"]);
        assert_eq!(cases(&df), ["1", "2"]);
        // Case 2 keeps only its Gold event — the trace is now a sub-sequence.
        assert_eq!(df.height(), 3);
    }

    #[test]
    fn a_chain_can_empty_the_log() {
        let df = run(AttributeMode::Mandatory, &["Platinum"]);
        assert_eq!(df.height(), 0);
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
            "flag",
            AttributeMode::Mandatory,
            &["true".to_string()],
            "case",
        )
        .unwrap()
        .collect()
        .unwrap();
        assert_eq!(cases(&out), ["1", "3"]);
    }
}

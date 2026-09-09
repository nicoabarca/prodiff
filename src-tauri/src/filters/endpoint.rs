//! The `Endpoint` filter: matches on a case's first or last activity.

use super::enums::{Endpoint, EndpointMode};
use polars::prelude::*;

pub fn apply(
    lf: LazyFrame,
    position: Endpoint,
    mode: EndpointMode,
    activities: &[String],
    case_col: &str,
    activity_col: &str,
) -> Result<LazyFrame, String> {
    // Rows are persisted sorted by (case, timestamp) at Event Log creation and
    // filtering preserves order, so first/last over the case window are the
    // case's endpoints without re-sorting.
    // Compared as text: the activities arrive as the display strings the
    // picker showed, and an activity column of numeric codes is stored as a
    // number, which would fail the comparison outright.
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
    Ok(match mode {
        EndpointMode::Mandatory => lf.filter(hit),
        EndpointMode::Forbidden => lf.filter(hit.not()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::column_mapping::ColumnMapping;
    use crate::filters::tests::support::{cases, log};
    use crate::filters::Filter;

    fn run(position: Endpoint, mode: EndpointMode, activities: &[&str]) -> DataFrame {
        let activities: Vec<String> = activities.iter().map(|a| a.to_string()).collect();
        apply(log().lazy(), position, mode, &activities, "case", "act")
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn endpoint_matches_the_cases_first_and_last_activity() {
        let starts = run(Endpoint::Start, EndpointMode::Mandatory, &["A"]);
        assert_eq!(cases(&starts), ["1", "2"]);
        let ends = run(Endpoint::End, EndpointMode::Mandatory, &["B"]);
        assert_eq!(cases(&ends), ["1", "3"]);
        let not_starting_with_a = run(Endpoint::Start, EndpointMode::Forbidden, &["A"]);
        assert_eq!(cases(&not_starting_with_a), ["3"]);
    }

    /// A log whose activities are numeric codes. The declared type is honoured
    /// at ingest, so the column is an i64 here and the endpoint filter still has
    /// to match the picker's "10" against it.
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
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"act_num","role":"activity_name","type":"integer","scope":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"}
            ]"#,
        )
        .unwrap();
        let out = crate::filters::apply(
            df.lazy(),
            &[Filter::Endpoint {
                position: Endpoint::Start,
                mode: EndpointMode::Mandatory,
                activities: vec!["10".to_string()],
            }],
            &numeric_activity,
            &crate::filters::ExcludedCases::new(),
        )
        .unwrap()
        .collect()
        .expect("a numeric activity column must not fail the comparison");
        assert_eq!(cases(&out), ["1", "2"]);
    }
}

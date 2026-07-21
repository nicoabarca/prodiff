//! Statistics derived from an Event Log. `summarize` is the whole surface —
//! callers hand over a DataFrame and the Column Mapping and get every figure
//! the dashboard shows.

use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::parsing::column_to_strings;
use crate::time::millis_to_iso;
use polars::prelude::*;
use std::collections::{HashMap, HashSet};

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EventLogStats {
    pub events: i64,
    pub cases: i64,
    pub activities: i64,
    pub variants: i64,
    pub timespan_start: Option<String>,
    pub timespan_end: Option<String>,
}

pub(crate) fn summarize(
    df: &DataFrame,
    mapping: &[ColumnMapping],
) -> Result<EventLogStats, String> {
    let case_col = require_role(mapping, ColumnRole::CaseId)?;
    let activity_col = require_role(mapping, ColumnRole::ActivityName)?;
    let timestamp_col = require_role(mapping, ColumnRole::CompleteTimestamp)?;

    match df.column(timestamp_col).map_err(|e| e.to_string())?.dtype() {
        DataType::Datetime(_, _) | DataType::Date => {}
        other => {
            return Err(format!(
                "Column \"{timestamp_col}\" doesn't look like a timestamp (parsed as {other:?}). Pick a different column or reformat the file."
            ));
        }
    }

    // Events missing any of the three required fields can't take part in any
    // statistic, so every figure below is computed over the surviving rows.
    let valid = df
        .drop_nulls(Some(&[
            case_col.to_string(),
            activity_col.to_string(),
            timestamp_col.to_string(),
        ]))
        .map_err(|e| e.to_string())?;

    let events = valid.height() as i64;
    let cases = valid
        .column(case_col)
        .map_err(|e| e.to_string())?
        .n_unique()
        .map_err(|e| e.to_string())? as i64;
    let activities = valid
        .column(activity_col)
        .map_err(|e| e.to_string())?
        .n_unique()
        .map_err(|e| e.to_string())? as i64;

    let case_ids = column_to_strings(&valid, case_col)?;
    let activity_names = column_to_strings(&valid, activity_col)?;
    let timestamps = timestamps_as_millis(&valid, timestamp_col)?;

    let variants = count_variants(&case_ids, &timestamps, &activity_names) as i64;
    let (timespan_start, timespan_end) = match (timestamps.iter().min(), timestamps.iter().max()) {
        (Some(min), Some(max)) => (Some(millis_to_iso(*min)), Some(millis_to_iso(*max))),
        _ => (None, None),
    };

    Ok(EventLogStats {
        events,
        cases,
        activities,
        variants,
        timespan_start,
        timespan_end,
    })
}

fn timestamps_as_millis(df: &DataFrame, column: &str) -> Result<Vec<i64>, String> {
    let series = df
        .column(column)
        .map_err(|e| e.to_string())?
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .map_err(|e| e.to_string())?;
    Ok(series
        .datetime()
        .map_err(|e| e.to_string())?
        .physical()
        .into_no_null_iter()
        .collect())
}

/// A variant is a distinct ordered sequence of activities within a case.
// ponytail: manual group+sort+join rather than polars' list API — simpler to
// get right at our stated scale (not tens of millions of rows).
fn count_variants(cases: &[String], timestamps: &[i64], activities: &[String]) -> usize {
    let mut by_case: HashMap<&str, Vec<(i64, &str)>> = HashMap::new();
    for i in 0..cases.len() {
        by_case
            .entry(cases[i].as_str())
            .or_default()
            .push((timestamps[i], activities[i].as_str()));
    }
    let mut traces: HashSet<String> = HashSet::new();
    for events in by_case.values_mut() {
        events.sort_by_key(|(ts, _)| *ts);
        let trace = events
            .iter()
            .map(|(_, a)| *a)
            .collect::<Vec<_>>()
            .join("\u{2192}");
        traces.insert(trace);
    }
    traces.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exactly the shape the frontend sends (see buildColumnMapping in
    /// mapping/+page.svelte) — pins the serde contract across the seam.
    fn frontend_mapping() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","granularity":"event"},
              {"name":"act","role":"activity_name","type":"string","granularity":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","granularity":"event"},
              {"name":"cost","role":"other","type":"integer","granularity":"event"}
            ]"#,
        )
        .expect("frontend column mapping payload should deserialize")
    }

    fn sample_log() -> DataFrame {
        let ts = Column::new("ts".into(), [0i64, 1_000, 2_000, 3_000, 4_000])
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        DataFrame::new(
            5,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3"]),
                Column::new("act".into(), ["A", "B", "A", "B", "A"]),
                ts,
                Column::new("cost".into(), [1i64, 2, 3, 4, 5]),
            ],
        )
        .unwrap()
    }

    #[test]
    fn summarizes_an_event_log() {
        let stats = summarize(&sample_log(), &frontend_mapping()).unwrap();
        assert_eq!(stats.events, 5);
        assert_eq!(stats.cases, 3);
        assert_eq!(stats.activities, 2);
        // case 1 = A→B, case 2 = A→B, case 3 = A  ⇒ two distinct traces
        assert_eq!(stats.variants, 2);
        assert_eq!(stats.timespan_start.as_deref(), Some("1970-01-01T00:00:00Z"));
        assert_eq!(stats.timespan_end.as_deref(), Some("1970-01-01T00:00:04Z"));
    }

    #[test]
    fn stats_serialize_as_camel_case_for_the_frontend() {
        let json = serde_json::to_string(&summarize(&sample_log(), &frontend_mapping()).unwrap())
            .unwrap();
        assert!(json.contains("\"timespanStart\""), "got: {json}");
        assert!(json.contains("\"timespanEnd\""), "got: {json}");
    }

    #[test]
    fn rejects_a_mapping_with_no_case_id() {
        let mapping: Vec<ColumnMapping> = serde_json::from_str(
            r#"[{"name":"act","role":"activity_name","type":"string","granularity":"event"}]"#,
        )
        .unwrap();
        let err = summarize(&sample_log(), &mapping).unwrap_err();
        assert!(err.contains("case ID"), "got: {err}");
    }

    #[test]
    fn rejects_a_non_timestamp_timestamp_column() {
        let mapping: Vec<ColumnMapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","granularity":"event"},
              {"name":"act","role":"activity_name","type":"string","granularity":"event"},
              {"name":"cost","role":"complete_timestamp","type":"integer","granularity":"event"}
            ]"#,
        )
        .unwrap();
        let err = summarize(&sample_log(), &mapping).unwrap_err();
        assert!(err.contains("doesn't look like a timestamp"), "got: {err}");
    }
}

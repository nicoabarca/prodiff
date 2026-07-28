//! Statistics derived from an Event Log. `summarize` is the whole surface —
//! callers hand over a DataFrame and the Column Mapping and get every figure
//! the dashboard shows.

use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::time::millis_to_iso;
use polars::prelude::*;

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EventLogStats {
    pub events: i64,
    pub cases: i64,
    pub activities: i64,
    pub variants: i64,
    pub avg_events_per_case: f64,
    /// Case duration = last event timestamp − first, in milliseconds. `None`
    /// when there are no cases at all (an over-narrow filter chain).
    pub avg_case_duration_ms: Option<f64>,
    pub median_case_duration_ms: Option<f64>,
    /// Distinct activities that cases begin / end with.
    pub start_activities: i64,
    pub end_activities: i64,
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

    let timestamps = timestamps_as_millis(&valid, timestamp_col)?;

    let per_case = per_case(&valid, case_col, timestamp_col, activity_col)?;
    let n_unique = |name: &str| -> Result<i64, String> {
        Ok(per_case
            .column(name)
            .map_err(|e| e.to_string())?
            .n_unique()
            .map_err(|e| e.to_string())? as i64)
    };
    let (avg_case_duration_ms, median_case_duration_ms) = duration_summary(&per_case)?;

    let (timespan_start, timespan_end) = match (timestamps.iter().min(), timestamps.iter().max()) {
        (Some(min), Some(max)) => (Some(millis_to_iso(*min)), Some(millis_to_iso(*max))),
        _ => (None, None),
    };

    Ok(EventLogStats {
        events,
        cases,
        activities,
        variants: n_unique("trace")?,
        avg_events_per_case: if cases == 0 {
            0.0
        } else {
            events as f64 / cases as f64
        },
        avg_case_duration_ms,
        median_case_duration_ms,
        start_activities: n_unique("start_activity")?,
        end_activities: n_unique("end_activity")?,
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

/// Mean and median case duration, both `None` for an empty log. Aggregated in
/// Polars rather than over a collected column so the empty case falls out
/// naturally instead of dividing by zero.
fn duration_summary(per_case: &DataFrame) -> Result<(Option<f64>, Option<f64>), String> {
    let summary = per_case
        .clone()
        .lazy()
        .select([
            col("duration_ms").mean().alias("avg"),
            col("duration_ms").median().alias("median"),
        ])
        .collect()
        .map_err(|e| e.to_string())?;

    let scalar = |name: &str| -> Result<Option<f64>, String> {
        Ok(summary
            .column(name)
            .map_err(|e| e.to_string())?
            .as_materialized_series()
            .f64()
            .map_err(|e| e.to_string())?
            .get(0))
    };
    Ok((scalar("avg")?, scalar("median")?))
}

/// One row per case: its trace, its endpoints and its duration. Every
/// case-shaped metric is derived from this single frame rather than a group_by
/// each — a variant is a distinct ordered sequence of activities within a case.
fn per_case(
    df: &DataFrame,
    case_col: &str,
    timestamp_col: &str,
    activity_col: &str,
) -> Result<DataFrame, String> {
    let ordered = col(activity_col).sort_by([col(timestamp_col)], SortMultipleOptions::default());
    let millis = col(timestamp_col)
        .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
        .cast(DataType::Int64);

    df.clone()
        .lazy()
        .group_by([col(case_col)])
        .agg([
            ordered.clone().alias("trace_activities"),
            ordered.clone().first().alias("start_activity"),
            ordered.last().alias("end_activity"),
            (millis.clone().max() - millis.min()).alias("duration_ms"),
        ])
        .with_column(
            col("trace_activities")
                .list()
                .join(lit("\u{2192}"), true)
                .alias("trace"),
        )
        .collect()
        .map_err(|e| e.to_string())
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
        assert_eq!(
            stats.timespan_start.as_deref(),
            Some("1970-01-01T00:00:00Z")
        );
        assert_eq!(stats.timespan_end.as_deref(), Some("1970-01-01T00:00:04Z"));
    }

    #[test]
    fn summarizes_the_per_case_metrics() {
        let stats = summarize(&sample_log(), &frontend_mapping()).unwrap();
        // 5 events over 3 cases.
        assert!((stats.avg_events_per_case - 5.0 / 3.0).abs() < 1e-9);
        // Durations are 1000ms, 1000ms and 0ms (case 3 is a single event).
        assert_eq!(stats.avg_case_duration_ms, Some(2000.0 / 3.0));
        assert_eq!(stats.median_case_duration_ms, Some(1000.0));
        // Every case starts with A; two end with B and one with A.
        assert_eq!(stats.start_activities, 1);
        assert_eq!(stats.end_activities, 2);
    }

    #[test]
    fn an_empty_log_yields_zeroed_metrics_rather_than_nan() {
        let empty = sample_log().slice(0, 0);
        let stats = summarize(&empty, &frontend_mapping()).unwrap();
        assert_eq!(stats.cases, 0);
        assert_eq!(stats.avg_events_per_case, 0.0);
        assert_eq!(stats.avg_case_duration_ms, None);
        assert_eq!(stats.timespan_start, None);
    }

    #[test]
    fn stats_serialize_as_camel_case_for_the_frontend() {
        let json =
            serde_json::to_string(&summarize(&sample_log(), &frontend_mapping()).unwrap()).unwrap();
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

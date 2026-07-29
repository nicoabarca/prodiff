use super::storage::{copy_original, create_project_dir, delete_project_dir, write_parquet};
use crate::column_mapping::{find_role, require_role, ColumnMapping, ColumnRole, ColumnType};
use crate::parsing::read_csv;
use crate::stats::{summarize, EventLogStats};
use polars::prelude::*;

fn target_dtype(column_type: ColumnType) -> DataType {
    match column_type {
        ColumnType::String => DataType::String,
        ColumnType::Integer => DataType::Int64,
        ColumnType::Float => DataType::Float64,
        ColumnType::Boolean => DataType::Boolean,
        ColumnType::Date => DataType::Date,
        ColumnType::Datetime => DataType::Datetime(TimeUnit::Milliseconds, None),
    }
}

/// The Column Mapping's declared type is what every later query assumes the
/// column physically is, so the Event Log is written in those types rather than
/// in whatever the CSV reader inferred from its first rows. Without this the two
/// silently disagree whenever the user overrides a suggested type — a numeric
/// resource id declared as text stays an i64 in the file, and every filter on it
/// fails at query time.
///
/// The cast is strict: a column that cannot be read as its declared type fails
/// the import naming itself, rather than nulling the offending rows.
fn cast_to_declared(mut df: DataFrame, columns: &[ColumnMapping]) -> Result<DataFrame, String> {
    for mapping in columns {
        // A column named in the mapping but missing from the file is the
        // frontend's error to catch; here it is simply nothing to cast.
        let Ok(column) = df.column(&mapping.name) else {
            continue;
        };
        let target = target_dtype(mapping.column_type);
        // Timestamps keep the precision and zone the CSV parse gave them —
        // re-casting a Datetime to the canonical unit gains nothing and would
        // drop a zone the analysis is happy to carry.
        let already = column.dtype() == &target
            || matches!(
                (column.dtype(), &target),
                (DataType::Datetime(..), DataType::Datetime(..))
            );
        if already {
            continue;
        }
        let cast = column.strict_cast(&target).map_err(|cause| {
            format!(
                "Column \"{}\" cannot be read as {}: {cause}",
                mapping.name,
                mapping.column_type.label()
            )
        })?;
        df.with_column(cast).map_err(|e| e.to_string())?;
    }
    Ok(df)
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventLogResult {
    #[serde(flatten)]
    pub stats: EventLogStats,
    pub original_path: String,
    pub event_log_path: String,
}

#[tauri::command]
pub fn create_event_log(
    app: tauri::AppHandle,
    project_id: String,
    source_path: String,
    columns: Vec<ColumnMapping>,
) -> Result<CreateEventLogResult, String> {
    let mut df = cast_to_declared(
        read_csv(&source_path, None).map_err(|e| e.to_string())?,
        &columns,
    )?;

    // Rows can arrive out of order (multi-case CSVs are rarely pre-sorted);
    // case/activity/variant counts and any later trace analysis all assume
    // each case's events run in timestamp order, so enforce it once here.
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let end_ts_col = require_role(&columns, ColumnRole::CompleteTimestamp)?;
    let mut sort_cols = vec![case_col, end_ts_col];
    if let Some(start_ts_col) = find_role(&columns, ColumnRole::StartTimestamp) {
        sort_cols.push(start_ts_col);
    }
    df = df
        .sort(sort_cols, SortMultipleOptions::default())
        .map_err(|e| e.to_string())?;

    let stats = summarize(&df, &columns)?;

    let dir = create_project_dir(&app, &project_id)?;
    let original_path = copy_original(&source_path, &dir)?;
    let event_log_path = write_parquet(&mut df, &dir)?;

    Ok(CreateEventLogResult {
        stats,
        original_path: original_path.to_string_lossy().into_owned(),
        event_log_path: event_log_path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn delete_project_files(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    delete_project_dir(&app, &project_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping(name: &str, column_type: &str) -> Vec<ColumnMapping> {
        serde_json::from_str(&format!(
            r#"[{{"name":"{name}","role":"other","type":"{column_type}"}}]"#
        ))
        .expect("mapping payload should deserialize")
    }

    /// A resource id that happens to be all digits — the case the CSV reader
    /// infers as an integer and the user re-declares as text.
    fn numeric_resource() -> DataFrame {
        DataFrame::new(3, vec![Column::new("res".into(), [561i64, 561, 3_302])]).unwrap()
    }

    #[test]
    fn declared_type_wins_over_the_inferred_one() {
        let df = cast_to_declared(numeric_resource(), &mapping("res", "string")).unwrap();
        assert_eq!(df.column("res").unwrap().dtype(), &DataType::String);
    }

    #[test]
    fn a_column_that_cannot_be_read_as_its_declared_type_fails_the_import() {
        let df = DataFrame::new(2, vec![Column::new("res".into(), ["561", "NIL"])]).unwrap();
        let error = cast_to_declared(df, &mapping("res", "integer")).unwrap_err();
        assert!(error.contains("\"res\""), "the column is named: {error}");
        assert!(
            error.contains("a whole number"),
            "the declared type is named: {error}"
        );
    }

    #[test]
    fn a_column_already_in_its_declared_type_is_left_alone() {
        let df = cast_to_declared(numeric_resource(), &mapping("res", "integer")).unwrap();
        assert_eq!(df.column("res").unwrap().dtype(), &DataType::Int64);
    }

    #[test]
    fn a_parsed_timestamp_keeps_the_precision_the_csv_reader_gave_it() {
        let ts = Column::new("ts".into(), [0i64, 1_000])
            .cast(&DataType::Datetime(TimeUnit::Microseconds, None))
            .unwrap();
        let df = cast_to_declared(
            DataFrame::new(2, vec![ts]).unwrap(),
            &mapping("ts", "datetime"),
        )
        .unwrap();
        assert_eq!(
            df.column("ts").unwrap().dtype(),
            &DataType::Datetime(TimeUnit::Microseconds, None)
        );
    }
}

use super::storage::{copy_original, create_project_dir, delete_project_dir, write_parquet};
use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::parsing::read_csv;
use crate::stats::{summarize, EventLogStats};
use polars::prelude::SortMultipleOptions;

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
    let mut df = read_csv(&source_path, None).map_err(|e| e.to_string())?;

    // Rows can arrive out of order (multi-case CSVs are rarely pre-sorted);
    // case/activity/variant counts and any later trace analysis all assume
    // each case's events run in timestamp order, so enforce it once here.
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let ts_col = require_role(&columns, ColumnRole::CompleteTimestamp)?;
    df = df
        .sort([case_col, ts_col], SortMultipleOptions::default())
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

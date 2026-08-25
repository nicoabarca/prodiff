//! Commands over a Group's materialized Event Log. The frontend owns the
//! `groups` table and hands over ids; Rust owns the files those ids name.

use super::storage::{delete_group, group_path, read_group, write_group};
use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::filters::queries::{case_ids, filtered, read_event_log};
use crate::filters::Filter;
use crate::stats::{summarize, EventLogStats};

/// Runs a Group's Filter List, writes the result as Parquet and returns its figures.
#[tauri::command]
pub fn apply_group(
    app: tauri::AppHandle,
    project_id: String,
    group_id: String,
    filters: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<EventLogStats, String> {
    let df = read_event_log(&app, &project_id)?;
    let mut applied = filtered(&app, &project_id, &df, &filters, &columns)?;
    write_group(&app, &project_id, &group_id, &mut applied)?;
    summarize(&applied, &columns)
}

/// Drops a Group's Parquet.
#[tauri::command]
pub fn delete_group_file(
    app: tauri::AppHandle,
    project_id: String,
    group_id: String,
) -> Result<(), String> {
    delete_group(&app, &project_id, &group_id)
}

/// Whether each of these Groups has been applied.
#[tauri::command]
pub fn applied_groups(
    app: tauri::AppHandle,
    project_id: String,
    group_ids: Vec<String>,
) -> Result<Vec<bool>, String> {
    group_ids
        .iter()
        .map(|id| Ok(group_path(&app, &project_id, id)?.exists()))
        .collect()
}

/// Cases present in every one of these Groups. Reported, never removed.
#[tauri::command]
pub fn shared_cases(
    app: tauri::AppHandle,
    project_id: String,
    group_ids: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<i64, String> {
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let mut per_group = group_ids
        .iter()
        .map(|id| case_ids(&read_group(&app, &project_id, id)?, case_col))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter();
    let Some(first) = per_group.next() else {
        return Ok(0);
    };
    let shared = per_group.fold(first, |kept, next| {
        kept.into_iter().filter(|id| next.contains(id)).collect()
    });
    Ok(shared.len() as i64)
}

/// Statistics for several Groups at once, in the order asked.
#[tauri::command]
pub fn group_stats(
    app: tauri::AppHandle,
    project_id: String,
    group_ids: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<EventLogStats>, String> {
    group_ids
        .iter()
        .map(|id| summarize(&read_group(&app, &project_id, id)?, &columns))
        .collect()
}

//! Commands over a Group's materialized Event Log. The frontend owns the
//! `groups` table and hands over ids; Rust owns the files those ids name.

use super::storage::{delete_group, group_path, read_group};
use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::event_log::storage::project_dir_for_app;
use crate::filters::queries::case_ids;
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
    let dir = project_dir_for_app(&app, &project_id)?;
    let group = super::GroupFilters {
        id: group_id,
        filters,
    };
    super::apply(&dir, &group, &columns)
}

/// Drops a Group's Parquet.
#[tauri::command]
pub fn delete_group_file(
    app: tauri::AppHandle,
    project_id: String,
    group_id: String,
) -> Result<(), String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    delete_group(&dir, &group_id)
}

/// Whether each of these Groups has been applied.
#[tauri::command]
pub fn applied_groups(
    app: tauri::AppHandle,
    project_id: String,
    group_ids: Vec<String>,
) -> Result<Vec<bool>, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    Ok(group_ids
        .iter()
        .map(|id| group_path(&dir, id).exists())
        .collect())
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
    let dir = project_dir_for_app(&app, &project_id)?;
    let mut per_group = group_ids
        .iter()
        .map(|id| case_ids(&read_group(&dir, id)?, case_col))
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
    let dir = project_dir_for_app(&app, &project_id)?;
    group_ids
        .iter()
        .map(|id| summarize(&read_group(&dir, id)?, &columns))
        .collect()
}

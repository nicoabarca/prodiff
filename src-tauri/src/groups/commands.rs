//! The Group seam. Applying a Filter List materializes the Group; every other
//! command here reads a Group that already exists, by id.
//!
//! The frontend owns the `groups` table and hands over ids. Rust owns the
//! files those ids name, and never learns a Group's name or colour.

use super::storage::{delete_group, group_path, read_group, write_group};
use crate::column_mapping::ColumnMapping;
use crate::filters::queries::{filtered, read_event_log};
use crate::filters::Filter;
use crate::stats::{summarize, EventLogStats};

/// Materializes a Group: runs its Filter List over the Event Log, writes the
/// result as Parquet and returns the figures for it.
///
/// The stats come free — the filtered frame is already in hand — so the caller
/// never needs a second pass to fill its cache.
#[tauri::command]
pub fn apply_group(
    app: tauri::AppHandle,
    project_id: String,
    group_id: String,
    filters: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<EventLogStats, String> {
    let df = read_event_log(&app, &project_id)?;
    let mut applied = filtered(&df, &filters, &columns)?;
    write_group(&app, &project_id, &group_id, &mut applied)?;
    summarize(&applied, &columns)
}

/// Drops a Group's Parquet. Called before the row, so a failure here leaves
/// both halves in place rather than a row pointing at nothing.
#[tauri::command]
pub fn delete_group_file(
    app: tauri::AppHandle,
    project_id: String,
    group_id: String,
) -> Result<(), String> {
    delete_group(&app, &project_id, &group_id)
}

/// Whether each of these Groups has been applied. The frontend calls this when
/// loading a project: a row whose file is missing is not corrupt, it is
/// unmaterialized, and re-applying fixes it.
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

/// Statistics for several Groups at once, in the order asked. Batched because
/// the Statistics view wants every Group on each render.
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

//! Commands over Custom Attribute columns. The frontend owns the
//! `custom_attributes` table and hands over ids and parsed formulas; Rust owns
//! the columns those ids name.

use super::formula::Formula;
use super::{CustomAttribute, EmptyCount, Impact};
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::project_dir_for_app;

/// Writes `set` into, and drops `remove` from, the Event Log and every applied
/// Group, and returns each written attribute's empty count.
#[tauri::command]
pub async fn update_custom_attributes(
    app: tauri::AppHandle,
    project_id: String,
    set: Vec<CustomAttribute>,
    remove: Vec<String>,
    group_ids: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<EmptyCount>, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        super::update(&dir, &set, &remove, &group_ids, &columns)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// What a draft formula would compute. Writes nothing.
#[tauri::command]
pub async fn custom_attribute_impact(
    app: tauri::AppHandle,
    project_id: String,
    formula: Formula,
    columns: Vec<ColumnMapping>,
) -> Result<Impact, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    tauri::async_runtime::spawn_blocking(move || super::impact(&dir, &formula, &columns))
        .await
        .map_err(|e| e.to_string())?
}

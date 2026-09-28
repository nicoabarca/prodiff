use super::SAMPLE_LOG;
use crate::column_mapping::ColumnMapping;
use crate::event_log::importer::{import_event_log, ImportWithGroups};
use crate::event_log::storage::project_dir_for_app;
use crate::groups::GroupFilters;
use tauri::path::BaseDirectory;
use tauri::Manager;

/// Imports the bundled sample Event Log under `project_id`, replacing whatever
/// was there, and applies `groups` to it in order.
#[tauri::command]
pub fn create_sample_project(
    app: tauri::AppHandle,
    project_id: String,
    columns: Vec<ColumnMapping>,
    groups: Vec<GroupFilters>,
) -> Result<ImportWithGroups, String> {
    let source = app
        .path()
        .resolve(SAMPLE_LOG, BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let dir = project_dir_for_app(&app, &project_id)?;
    import_event_log(&dir, &source.to_string_lossy(), &columns, &groups)
}

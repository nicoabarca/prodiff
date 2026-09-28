//! The Statistics view's command. Takes Group ids and reads the Parquet each
//! one names; `groups` is ordered and holds one or two ids.

use super::{compare, GroupComparison};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::project_dir_for_app;
use crate::parsing::commands::off_main_thread;

#[tauri::command]
pub async fn group_comparison(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    columns: Vec<ColumnMapping>,
    attributes: Vec<String>,
) -> Result<GroupComparison, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    off_main_thread(move || {
        let logs = read_groups(&dir, &groups)?;
        compare(&logs, &columns, &attributes)
    })
    .await
}

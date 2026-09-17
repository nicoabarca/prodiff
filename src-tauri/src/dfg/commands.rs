use super::{build, Dfg, RequestedAttribute};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::project_dir_for_app;

#[tauri::command]
pub fn dfg(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    attributes: Vec<RequestedAttribute>,
    columns: Vec<ColumnMapping>,
) -> Result<Dfg, String> {
    let logs = read_groups(&project_dir_for_app(&app, &project_id)?, &groups)?;
    build(&logs, &columns, &attributes)
}

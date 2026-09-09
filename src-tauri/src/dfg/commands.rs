use super::{build, Dfg, RequestedAttribute};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;

#[tauri::command]
pub fn dfg(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    attributes: Vec<RequestedAttribute>,
    columns: Vec<ColumnMapping>,
) -> Result<Dfg, String> {
    let logs = read_groups(&app, &project_id, &groups)?;
    build(&logs, &columns, &attributes)
}

use super::{build, Dfg, RequestedAttribute};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::project_dir_for_app;

#[tauri::command]
pub async fn dfg(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    attributes: Vec<RequestedAttribute>,
    columns: Vec<ColumnMapping>,
    variants: Option<Vec<String>>,
) -> Result<Dfg, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let logs = read_groups(&dir, &groups)?;
        build(&logs, &columns, &attributes, variants.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

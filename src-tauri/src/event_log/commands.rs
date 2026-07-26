use super::storage::{copy_original, create_project_dir, delete_project_dir, write_parquet};
use crate::column_mapping::ColumnMapping;
use crate::parsing::read_csv;
use crate::stats::{summarize, EventLogStats};

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

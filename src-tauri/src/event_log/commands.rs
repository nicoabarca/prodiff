use super::storage::{copy_original, create_project_dir, delete_project_dir, write_parquet};
use crate::column_mapping::ColumnMapping;
use crate::parsing::read_csv;
use crate::stats::{summarize, EventLogStats};

#[tauri::command]
pub fn create_event_log(
    app: tauri::AppHandle,
    project_id: String,
    source_path: String,
    columns: Vec<ColumnMapping>,
) -> Result<EventLogStats, String> {
    let mut df = read_csv(&source_path, None).map_err(|e| e.to_string())?;
    let stats = summarize(&df, &columns)?;

    let dir = create_project_dir(&app, &project_id)?;
    copy_original(&source_path, &dir)?;
    write_parquet(&mut df, &dir)?;

    Ok(stats)
}

#[tauri::command]
pub fn delete_project_files(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    delete_project_dir(&app, &project_id)
}

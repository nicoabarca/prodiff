use polars::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// `{app_data}/projects/{project_id}/`. Rust owns this layout — the frontend
/// stores only the project id and never a filesystem path.
pub(crate) fn project_dir_path(app: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.join("projects").join(project_id))
}

pub(crate) fn create_project_dir(
    app: &tauri::AppHandle,
    project_id: &str,
) -> Result<PathBuf, String> {
    let dir = project_dir_path(app, project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Copies the raw upload into the project directory, kept alongside the Parquet conversion.
/// Returns the copy's path — the frontend persists it as the project's reference to the
/// original file.
pub(crate) fn copy_original(source_path: &str, project_dir: &Path) -> Result<PathBuf, String> {
    let extension = PathBuf::from(source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("csv")
        .to_string();
    let dest = project_dir.join(format!("original.{extension}"));
    fs::copy(source_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

/// Writes the normalized Event Log as Parquet. Returns its path — this is the file all future
/// analysis reads from, so the frontend persists it as the project's source of truth.
pub(crate) fn write_parquet(df: &mut DataFrame, project_dir: &Path) -> Result<PathBuf, String> {
    let path = project_dir.join("event_log.parquet");
    let file = fs::File::create(&path).map_err(|e| e.to_string())?;
    ParquetWriter::new(file)
        .finish(df)
        .map_err(|e| e.to_string())?;
    Ok(path)
}

/// Where a project's persisted Event Log lives. Rust derives this from the
/// project id rather than trusting a path from the frontend.
pub(crate) fn event_log_path(app: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let path = project_dir_path(app, project_id)?.join("event_log.parquet");
    if !path.exists() {
        return Err(format!("No event log found for project {project_id}."));
    }
    Ok(path)
}

/// Deletes `{app_data}/projects/{project_id}/` and everything in it. No-op if
/// the directory is already gone (deleting an already-deleted project).
pub(crate) fn delete_project_dir(app: &tauri::AppHandle, project_id: &str) -> Result<(), String> {
    let dir = project_dir_path(app, project_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

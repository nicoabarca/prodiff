use polars::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// `{app_data}/projects/`.
pub(crate) fn projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.join("projects"))
}

/// `{projects_dir}/{project_id}/`.
pub(crate) fn project_dir(projects_dir: &Path, project_id: &str) -> PathBuf {
    projects_dir.join(project_id)
}

/// Resolves one project's directory from the Tauri app data directory.
pub(crate) fn project_dir_for_app(
    app: &tauri::AppHandle,
    project_id: &str,
) -> Result<PathBuf, String> {
    Ok(project_dir(&projects_dir(app)?, project_id))
}

/// The file name the raw upload is copied to: `original.{extension}`.
pub(crate) fn original_file_name(source_path: &str) -> String {
    let extension = Path::new(source_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("csv");
    format!("original.{extension}")
}

/// Copies the raw upload into the project directory and returns the copy's path.
pub(crate) fn copy_original(source_path: &str, project_dir: &Path) -> Result<PathBuf, String> {
    let dest = project_dir.join(original_file_name(source_path));
    fs::copy(source_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest)
}

pub(crate) const EVENT_LOG_FILE: &str = "event_log.parquet";

/// Writes the normalized Event Log as Parquet and returns its path.
pub(crate) fn write_parquet(df: &mut DataFrame, project_dir: &Path) -> Result<PathBuf, String> {
    let path = project_dir.join(EVENT_LOG_FILE);
    let file = fs::File::create(&path).map_err(|e| e.to_string())?;
    ParquetWriter::new(file)
        .finish(df)
        .map_err(|e| e.to_string())?;
    Ok(path)
}

/// Where a project's persisted Event Log lives.
pub(crate) fn event_log_path(project_dir: &Path) -> Result<PathBuf, String> {
    let path = project_dir.join(EVENT_LOG_FILE);
    if !path.exists() {
        return Err(format!("No event log found in {}.", project_dir.display()));
    }
    Ok(path)
}

/// Deletes `{projects_dir}/{project_id}/`. No-op if it is already gone.
pub(crate) fn delete_project_dir(projects_dir: &Path, project_id: &str) -> Result<(), String> {
    let dir = project_dir(projects_dir, project_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

//! Where a Group's materialized Event Log lives.

use crate::event_log::storage::project_dir_path;
use polars::prelude::*;
use std::fs;
use std::path::PathBuf;

/// The id the Original answers to. It has no file of its own.
pub const ORIGINAL: &str = "original";

/// `{app_data}/projects/{project_id}/groups/`.
fn groups_dir(app: &tauri::AppHandle, project_id: &str) -> Result<PathBuf, String> {
    Ok(project_dir_path(app, project_id)?.join("groups"))
}

pub(crate) fn group_path(
    app: &tauri::AppHandle,
    project_id: &str,
    group_id: &str,
) -> Result<PathBuf, String> {
    Ok(groups_dir(app, project_id)?.join(format!("{group_id}.parquet")))
}

/// Writes a Group's cases as Parquet.
pub(crate) fn write_group(
    app: &tauri::AppHandle,
    project_id: &str,
    group_id: &str,
    df: &mut DataFrame,
) -> Result<(), String> {
    fs::create_dir_all(groups_dir(app, project_id)?).map_err(|e| e.to_string())?;
    let file = fs::File::create(group_path(app, project_id, group_id)?).map_err(|e| e.to_string())?;
    ParquetWriter::new(file)
        .finish(df)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reads a Group's cases. `original` reads the project's whole Event Log.
pub(crate) fn read_group(
    app: &tauri::AppHandle,
    project_id: &str,
    group_id: &str,
) -> Result<DataFrame, String> {
    if group_id == ORIGINAL {
        return crate::filters::queries::read_event_log(app, project_id);
    }
    let path = group_path(app, project_id, group_id)?;
    if !path.exists() {
        return Err(format!("Group {group_id} has not been applied yet."));
    }
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    ParquetReader::new(file).finish().map_err(|e| e.to_string())
}

/// Deletes a Group's file. No-op when it was never applied.
pub(crate) fn delete_group(
    app: &tauri::AppHandle,
    project_id: &str,
    group_id: &str,
) -> Result<(), String> {
    let path = group_path(app, project_id, group_id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

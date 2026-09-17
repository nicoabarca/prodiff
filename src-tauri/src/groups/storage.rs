//! Where a Group's materialized Event Log lives.

use polars::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};

/// The id the Original answers to. It has no file of its own.
pub const ORIGINAL: &str = "original";

/// `{project_dir}/groups/`.
fn groups_dir(project_dir: &Path) -> PathBuf {
    project_dir.join("groups")
}

pub(crate) fn group_path(project_dir: &Path, group_id: &str) -> PathBuf {
    groups_dir(project_dir).join(format!("{group_id}.parquet"))
}

/// Writes a Group's cases as Parquet.
pub(crate) fn write_group(
    project_dir: &Path,
    group_id: &str,
    df: &mut DataFrame,
) -> Result<(), String> {
    fs::create_dir_all(groups_dir(project_dir)).map_err(|e| e.to_string())?;
    let file = fs::File::create(group_path(project_dir, group_id)).map_err(|e| e.to_string())?;
    ParquetWriter::new(file)
        .finish(df)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reads a Group's cases. `original` reads the project's whole Event Log.
pub(crate) fn read_group(project_dir: &Path, group_id: &str) -> Result<DataFrame, String> {
    if group_id == ORIGINAL {
        return crate::filters::queries::read_event_log(project_dir);
    }
    let path = group_path(project_dir, group_id);
    if !path.exists() {
        return Err(format!("Group {group_id} has not been applied yet."));
    }
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    ParquetReader::new(file).finish().map_err(|e| e.to_string())
}

/// Deletes a Group's file. No-op when it was never applied.
pub(crate) fn delete_group(project_dir: &Path, group_id: &str) -> Result<(), String> {
    let path = group_path(project_dir, group_id);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

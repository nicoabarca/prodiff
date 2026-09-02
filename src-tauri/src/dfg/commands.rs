//! The DFG command takes Group ids and reads the Parquet each one names, the
//! same way the tree commands do. Filter Lists never reach this side, and
//! nothing derived is persisted.

use super::{build, Dfg};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;

/// The whole graph of the Groups as they stand: every node, every edge, the
/// figures both sides measure, and the metrics the frontend simplifies by.
///
/// `groups` is ordered and holds one or two ids. One is single-Group mode: the
/// graph still renders, with counts and Summaries but no Significance Test.
#[tauri::command]
pub fn dfg(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    attributes: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<Dfg, String> {
    let logs = read_groups(&app, &project_id, &groups)?;
    build(&logs, &columns, &attributes)
}

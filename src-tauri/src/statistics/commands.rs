//! The Statistics view's command. Takes Group ids and reads the Parquet each
//! one names; `groups` is ordered and holds one or two ids.

use super::{compare, GroupComparison};
use crate::analysis::reduction::{plan, RelationSummary};
use crate::analysis::{read_groups, GroupLog};
use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::event_log::storage::project_dir_for_app;
use crate::groups::storage::read_case_column;
use crate::parsing::commands::off_main_thread;

#[tauri::command]
pub async fn group_comparison(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    columns: Vec<ColumnMapping>,
    attributes: Vec<String>,
) -> Result<GroupComparison, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    off_main_thread(move || {
        let logs = read_groups(&dir, &groups, &columns)?;
        compare(&logs, &columns, &attributes)
    })
    .await
}

/// How two Groups relate and what the rule removes from each, read from their
/// case columns only. The comparison views wait on it before they build.
#[tauri::command]
pub async fn comparison_relation(
    app: tauri::AppHandle,
    project_id: String,
    group_ids: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<RelationSummary, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    off_main_thread(move || {
        let [first, second] = group_ids.as_slice() else {
            return Err("comparison_relation takes two group ids".to_string());
        };
        let case_col = require_role(&columns, ColumnRole::CaseId)?;
        let read = |id: &String| -> Result<GroupLog, String> {
            Ok(GroupLog {
                id: id.clone(),
                df: read_case_column(&dir, id, case_col)?,
            })
        };
        Ok(plan(&read(first)?, &read(second)?, case_col)?.summary)
    })
    .await
}

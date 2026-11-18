use super::{build, place_values, Dfg, DfgOutlierTarget, RequestedAttribute, SUPERSEDED};
use crate::analysis::{outliers_by_group, read_groups, Outliers};
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::project_dir_for_app;
use crate::parsing::commands::off_main_thread;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// The newest `dfg` request. A build that finds a newer one between its stages
/// gives up: its result would be dropped by the view anyway.
static LATEST: AtomicU64 = AtomicU64::new(0);

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
    let request = LATEST.fetch_add(1, Ordering::SeqCst) + 1;
    off_main_thread(move || {
        let superseded = || LATEST.load(Ordering::SeqCst) != request;
        let logs = read_groups(&dir, &groups, &columns)?;
        if superseded() {
            return Err(SUPERSEDED.to_string());
        }
        build(
            &logs,
            &columns,
            &attributes,
            variants.as_deref(),
            &superseded,
        )
    })
    .await
}

/// The values past the whiskers of one box plot the DFG draws, per Group, over
/// the cases of the Variants selected. Not ordered against `dfg` requests: the
/// view drops a stale response itself.
#[tauri::command]
pub async fn dfg_outliers(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    columns: Vec<ColumnMapping>,
    variants: Option<Vec<String>>,
    target: DfgOutlierTarget,
) -> Result<HashMap<String, Outliers>, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    off_main_thread(move || {
        let logs = read_groups(&dir, &groups, &columns)?;
        let values = place_values(&logs, &columns, &target, variants.as_deref())?;
        let ids: Vec<String> = logs.iter().map(|log| log.id.clone()).collect();
        Ok(outliers_by_group(&ids, values))
    })
    .await
}

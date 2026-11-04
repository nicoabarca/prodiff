use super::{build, Dfg, RequestedAttribute};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::project_dir_for_app;
use crate::parsing::commands::off_main_thread;

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
    off_main_thread(move || {
        let started = std::time::Instant::now();
        let logs = read_groups(&dir, &groups, &columns)?;
        eprintln!("[dfg timing] read_groups (incl. shared-case reduction): {:?}", started.elapsed());
        let at = std::time::Instant::now();
        let out = build(&logs, &columns, &attributes, variants.as_deref());
        eprintln!("[dfg timing] build: {:?}", at.elapsed());
        eprintln!("[dfg timing] TOTAL in Rust: {:?}", started.elapsed());
        out
    })
    .await
}

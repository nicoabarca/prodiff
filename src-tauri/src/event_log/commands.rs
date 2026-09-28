use super::importer::{
    case_column_violations, import_frame, CaseColumnViolation, CreateEventLogResult,
};
use super::storage::{delete_project_dir, project_dir_for_app, projects_dir};
use crate::column_mapping::ColumnMapping;
use crate::parsing::draft::{drafts_dir, read_upload};
use std::path::Path;

#[tauri::command]
pub fn create_event_log(
    app: tauri::AppHandle,
    project_id: String,
    source_path: String,
    columns: Vec<ColumnMapping>,
) -> Result<CreateEventLogResult, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    let df = read_upload(&drafts_dir(&app)?, &source_path, None)?;
    import_frame(&dir, &source_path, df, &columns, &[]).map(|imported| imported.event_log)
}

/// Only the violating columns come back.
#[tauri::command]
pub fn check_case_columns(
    app: tauri::AppHandle,
    source_path: String,
    case_column: String,
    columns: Vec<String>,
) -> Result<Vec<CaseColumnViolation>, String> {
    violations(&drafts_dir(&app)?, &source_path, &case_column, &columns)
}

fn violations(
    drafts_dir: &Path,
    source_path: &str,
    case_column: &str,
    columns: &[String],
) -> Result<Vec<CaseColumnViolation>, String> {
    if columns.is_empty() {
        return Ok(Vec::new());
    }
    let df = read_upload(drafts_dir, source_path, None)?;
    case_column_violations(&df, case_column, columns)
}

#[tauri::command]
pub fn delete_project_files(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    delete_project_dir(&projects_dir(&app)?, &project_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checking_no_columns_reads_nothing() {
        assert!(violations(Path::new("drafts"), "nowhere.csv", "case", &[])
            .unwrap()
            .is_empty());
    }
}

use super::importer::{
    case_column_violations, import_event_log, CaseColumnViolation, CreateEventLogResult,
};
use super::storage::{delete_project_dir, project_dir, projects_dir};
use crate::column_mapping::ColumnMapping;
use crate::parsing::read_csv;

#[tauri::command]
pub fn create_event_log(
    app: tauri::AppHandle,
    project_id: String,
    source_path: String,
    columns: Vec<ColumnMapping>,
) -> Result<CreateEventLogResult, String> {
    let dir = project_dir(&projects_dir(&app)?, &project_id);
    import_event_log(&dir, &source_path, &columns)
}

/// Only the violating columns come back.
#[tauri::command]
pub fn check_case_columns(
    source_path: String,
    case_column: String,
    columns: Vec<String>,
) -> Result<Vec<CaseColumnViolation>, String> {
    if columns.is_empty() {
        return Ok(Vec::new());
    }
    let df = read_csv(&source_path, None).map_err(|e| e.to_string())?;
    case_column_violations(&df, &case_column, &columns)
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
        assert!(
            check_case_columns("nowhere.csv".into(), "case".into(), Vec::new())
                .unwrap()
                .is_empty()
        );
    }
}

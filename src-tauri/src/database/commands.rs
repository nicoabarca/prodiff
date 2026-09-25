use tauri::Manager;

/// Makes room for a backup of the database at `from_version` and returns the
/// absolute path to write it to.
#[tauri::command]
pub fn prepare_database_backup(app: tauri::AppHandle, from_version: u32) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = super::prepare_backup(&app_data_dir, from_version)?;
    Ok(path.to_string_lossy().into_owned())
}

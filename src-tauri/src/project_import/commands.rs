use super::bundle::{self, OpenedBundle};
use super::{build_staged, BuildInput, Built};
use crate::event_log::storage::project_dir_for_app;
use crate::parsing::commands::off_main_thread;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// `{app_data}/imports/`: where a zipped bundle's CSV is extracted until the
/// import that reads it ends.
fn imports_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.join("imports"))
}

/// Reads the manifest of the bundle at `path`, a `.zip` or a folder, and finds
/// its CSV.
#[tauri::command]
pub async fn open_bundle(app: tauri::AppHandle, path: String) -> Result<OpenedBundle, String> {
    let imports = imports_dir(&app)?;
    off_main_thread(move || bundle::open(Path::new(&path), &imports)).await
}

/// Removes whatever `open_bundle` extracted, for an import that will not run.
#[tauri::command]
pub async fn discard_bundle(app: tauri::AppHandle) -> Result<(), String> {
    let imports = imports_dir(&app)?;
    off_main_thread(move || match fs::remove_dir_all(&imports) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    })
    .await
}

/// Builds the Project `project_id` from the CSV at `csv_path`, replacing it
/// only if every step succeeds, then removes whatever `open_bundle` extracted.
#[tauri::command]
pub async fn import_project(
    app: tauri::AppHandle,
    project_id: String,
    csv_path: String,
    input: BuildInput,
) -> Result<Built, String> {
    let dir = project_dir_for_app(&app, &project_id)?;
    let imports = imports_dir(&app)?;
    off_main_thread(move || {
        let built = build_staged(&dir, &csv_path, &input);
        let _ = fs::remove_dir_all(&imports);
        built
    })
    .await
}

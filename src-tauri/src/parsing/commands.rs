use super::draft::{self, drafts_dir, read_upload};
use super::xes::{is_xes_path, suggested_mapping};
use super::{analyze, column_to_strings, dtype_label, TimestampColumnReport};
use crate::column_mapping::ColumnRole;
use tauri::ipc::Channel;

/// The mapping a file states for one of its columns, where its format states
/// one. `scope` is `event` or `case`.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSuggestion {
    role: ColumnRole,
    scope: &'static str,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnPreview {
    name: String,
    dtype: String,
    suggested: Option<ColumnSuggestion>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogPreview {
    columns: Vec<ColumnPreview>,
    rows: Vec<Vec<String>>,
}

/// Reading an upload can take minutes for a large XES, so the commands that read
/// one run off the main thread.
pub(crate) async fn off_main_thread<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

/// How much of an upload has been read, in bytes of the file.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReadProgress {
    read: u64,
    total: u64,
}

#[tauri::command]
pub async fn preview_event_log(
    app: tauri::AppHandle,
    path: String,
    on_progress: Channel<ReadProgress>,
) -> Result<EventLogPreview, String> {
    let drafts = drafts_dir(&app)?;
    off_main_thread(move || {
        preview(&drafts, &path, &mut |read, total| {
            let _ = on_progress.send(ReadProgress { read, total });
        })
    })
    .await
}

fn preview(
    drafts: &std::path::Path,
    path: &str,
    progress: &mut dyn FnMut(u64, u64),
) -> Result<EventLogPreview, String> {
    let preview_rows = 300;
    let df = read_upload(drafts, path, Some(preview_rows), progress)?;
    let xes = is_xes_path(path);

    let columns: Vec<ColumnPreview> = df
        .get_column_names()
        .into_iter()
        .map(|name| {
            let column = df.column(name).expect("column exists");
            ColumnPreview {
                name: name.to_string(),
                dtype: dtype_label(column.dtype()).to_string(),
                suggested: xes.then(|| {
                    let (role, case) = suggested_mapping(name);
                    ColumnSuggestion {
                        role,
                        scope: if case { "case" } else { "event" },
                    }
                }),
            }
        })
        .collect();

    let head = df.head(Some(preview_rows));
    let mut rows: Vec<Vec<String>> = vec![Vec::new(); head.height()];
    for col in &columns {
        let values = column_to_strings(&head, &col.name)?;
        for (i, v) in values.into_iter().enumerate() {
            rows[i].push(v);
        }
    }

    Ok(EventLogPreview { columns, rows })
}

#[tauri::command]
pub fn event_log_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(path)
        .map(|metadata| metadata.len())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn analyze_timestamp_columns(
    app: tauri::AppHandle,
    path: String,
    columns: Vec<String>,
    patterns: Vec<String>,
) -> Result<Vec<TimestampColumnReport>, String> {
    let drafts = drafts_dir(&app)?;
    off_main_thread(move || {
        let df = read_upload(&drafts, &path, None, &mut |_, _| {})?;
        analyze(&df, &columns, &patterns)
    })
    .await
}

#[tauri::command]
pub fn discard_event_log_draft(app: tauri::AppHandle, path: String) -> Result<(), String> {
    draft::discard(&drafts_dir(&app)?, &path)
}

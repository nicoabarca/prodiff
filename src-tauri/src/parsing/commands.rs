use super::draft::{self, drafts_dir, read_upload};
use super::xes::{is_xes_path, suggested_mapping};
use super::{analyze, column_to_strings, dtype_label, TimestampColumnReport};
use crate::column_mapping::ColumnRole;

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

#[tauri::command]
pub fn preview_event_log(app: tauri::AppHandle, path: String) -> Result<EventLogPreview, String> {
    let preview_rows = 300;
    let df = read_upload(&drafts_dir(&app)?, &path, Some(preview_rows))?;
    let xes = is_xes_path(&path);

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
pub fn analyze_timestamp_columns(
    app: tauri::AppHandle,
    path: String,
    columns: Vec<String>,
    patterns: Vec<String>,
) -> Result<Vec<TimestampColumnReport>, String> {
    let df = read_upload(&drafts_dir(&app)?, &path, None)?;
    analyze(&df, &columns, &patterns)
}

#[tauri::command]
pub fn discard_event_log_draft(app: tauri::AppHandle, path: String) -> Result<(), String> {
    draft::discard(&drafts_dir(&app)?, &path)
}

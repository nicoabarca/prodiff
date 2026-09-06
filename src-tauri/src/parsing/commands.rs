use super::{analyze, column_to_strings, dtype_label, read_csv, TimestampColumnReport};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnPreview {
    name: String,
    dtype: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogPreview {
    columns: Vec<ColumnPreview>,
    rows: Vec<Vec<String>>,
}

#[tauri::command]
pub fn preview_event_log(path: String) -> Result<EventLogPreview, String> {
    let preview_rows = 300;
    let df = read_csv(&path, Some(preview_rows)).map_err(|e| e.to_string())?;

    let columns: Vec<ColumnPreview> = df
        .get_column_names()
        .into_iter()
        .map(|name| {
            let column = df.column(name).expect("column exists");
            ColumnPreview {
                name: name.to_string(),
                dtype: dtype_label(column.dtype()).to_string(),
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
pub fn analyze_timestamp_columns(
    path: String,
    columns: Vec<String>,
    patterns: Vec<String>,
) -> Result<Vec<TimestampColumnReport>, String> {
    analyze(&path, &columns, &patterns)
}

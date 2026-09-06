use super::{analyze, column_to_strings, dtype_label, read_csv, TimestampColumnReport};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnPreview {
    name: String,
    dtype: String,
    /// Missing cells over the whole file, not over the previewed rows. An empty
    /// cell is null; a whitespace-only cell is not.
    null_count: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventLogPreview {
    columns: Vec<ColumnPreview>,
    rows: Vec<Vec<String>>,
    /// Rows in the file, which is the denominator every `nullCount` is over.
    total_rows: usize,
}

#[tauri::command]
pub fn preview_event_log(path: String) -> Result<EventLogPreview, String> {
    let preview_rows = 50;
    // The whole file is read so the null counts and the inferred dtypes cover
    // every row; only the head is sent back as rows.
    let df = read_csv(&path, None).map_err(|e| e.to_string())?;
    let total_rows = df.height();

    let columns: Vec<ColumnPreview> = df
        .get_column_names()
        .into_iter()
        .map(|name| {
            let column = df.column(name).expect("column exists");
            ColumnPreview {
                name: name.to_string(),
                dtype: dtype_label(column.dtype()).to_string(),
                null_count: column.null_count(),
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

    Ok(EventLogPreview {
        columns,
        rows,
        total_rows,
    })
}

/// Full-file inspection of the columns the user is treating as timestamps. The
/// catalog comes from the frontend, in the user's own vocabulary, and comes
/// back attached to each count.
#[tauri::command]
pub fn analyze_timestamp_columns(
    path: String,
    columns: Vec<String>,
    patterns: Vec<String>,
) -> Result<Vec<TimestampColumnReport>, String> {
    analyze(&path, &columns, &patterns)
}

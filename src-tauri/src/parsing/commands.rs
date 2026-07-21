use super::{column_to_strings, dtype_label, read_csv};

#[derive(serde::Serialize)]
pub struct ColumnPreview {
    name: String,
    dtype: String,
}

#[derive(serde::Serialize)]
pub struct EventLogPreview {
    columns: Vec<ColumnPreview>,
    rows: Vec<Vec<String>>,
}

#[tauri::command]
pub fn preview_event_log(path: String) -> Result<EventLogPreview, String> {
    let df = read_csv(&path, Some(50)).map_err(|e| e.to_string())?;

    let columns: Vec<ColumnPreview> = df
        .get_column_names()
        .into_iter()
        .map(|name| {
            let dtype = df.column(name).expect("column exists").dtype();
            ColumnPreview {
                name: name.to_string(),
                dtype: dtype_label(dtype).to_string(),
            }
        })
        .collect();

    let mut rows: Vec<Vec<String>> = vec![Vec::new(); df.height()];
    for col in &columns {
        let values = column_to_strings(&df, &col.name)?;
        for (i, v) in values.into_iter().enumerate() {
            rows[i].push(v);
        }
    }

    Ok(EventLogPreview { columns, rows })
}

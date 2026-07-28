//! The Comparison Directed Tree seam. Like the filter commands, Rust is
//! stateless here: the frontend composes each Group's chain (base first) and
//! hands it over whole, and nothing derived is persisted on this side.

use super::{build, DirectedTree};
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::event_log_path;
use crate::filters::{apply, Filter};
use polars::prelude::*;

fn filtered(
    df: &DataFrame,
    chain: &[Filter],
    columns: &[ColumnMapping],
) -> Result<DataFrame, String> {
    apply(df.clone().lazy(), chain, columns)?
        .collect()
        .map_err(|e| e.to_string())
}

/// Builds the whole tree in one pass: both Groups share a single read of the
/// Parquet file, and every Node Aggregate, Significance Test and Co-movement
/// pair ships with it.
///
/// `group_b` is `None` in one-Group mode — the tree still renders, with case
/// counts and aggregates but no comparison anywhere.
///
/// `max_variants` is how many Variants the view is asking to see. It cuts
/// before any aggregation, so the Significance Tests describe the Variants
/// included rather than every Variant the log has.
#[tauri::command]
pub fn directed_tree(
    app: tauri::AppHandle,
    project_id: String,
    group_a: Vec<Filter>,
    group_b: Option<Vec<Filter>>,
    attributes: Vec<String>,
    columns: Vec<ColumnMapping>,
    max_variants: Option<usize>,
) -> Result<DirectedTree, String> {
    let path = event_log_path(&app, &project_id)?;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let df = ParquetReader::new(file)
        .finish()
        .map_err(|e| e.to_string())?;

    let a = filtered(&df, &group_a, &columns)?;
    let b = match &group_b {
        Some(chain) => Some(filtered(&df, chain, &columns)?),
        None => None,
    };

    build(&a, b.as_ref(), &columns, &attributes, max_variants)
}

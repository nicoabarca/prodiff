//! The tree commands take Group ids and read the Parquet each one names. Filter
//! Lists never reach this side, and nothing derived is persisted.
//!
//! `groups` is ordered and holds one or two ids. One is single-Group mode: the
//! tree still renders, with case counts and aggregates but no comparison.

use super::distributions::{distributions, NodeDistributions, Scope};
use super::{build, DirectedTree};
use crate::analysis::read_groups;
use crate::column_mapping::ColumnMapping;

/// One Variant as the picker lists it. `key` is what `directed_tree` takes back
/// as a selection and what a terminal node carries, so the two never have to
/// agree on a re-derivation.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VariantRow {
    pub key: String,
    pub activities: Vec<String>,
    pub cases: std::collections::HashMap<String, i64>,
}

/// Every Variant of the Groups as they stand, for the picker. Available before
/// the first build, and independent of what any build included. Runs no
/// aggregation and no Significance Test, so it is cheap to call on opening a
/// panel.
#[tauri::command]
pub fn list_variants(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<VariantRow>, String> {
    let logs = read_groups(&app, &project_id, &groups)?;

    let mut rows = super::variant_rows(&logs, &columns)?;
    // Same order the cold-build cut uses, so the list the user sees and the set
    // the backend would have picked rank identically.
    let total = |row: &VariantRow| row.cases.values().sum::<i64>();
    rows.sort_by(|x, y| total(y).cmp(&total(x)).then_with(|| x.key.cmp(&y.key)));
    Ok(rows)
}

/// `variants` is the set the picker has checked, by Variant key. It cuts before
/// any aggregation, so the Significance Tests describe exactly the Variants
/// included. `None` is a cold build, which opens on the Variants covering most
/// of the cases.
#[tauri::command]
pub fn directed_tree(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    attributes: Vec<String>,
    columns: Vec<ColumnMapping>,
    variants: Option<Vec<String>>,
) -> Result<DirectedTree, String> {
    let logs = read_groups(&app, &project_id, &groups)?;

    build(&logs, &columns, &attributes, variants.as_deref())
}

/// One node's Distributions: value counts per attribute, per Group, under one
/// Scope. Not part of `directed_tree`.
///
/// The node is named by `variants`, the Variant keys of every visible leaf in
/// its subtree, and `depth`, its distance from the synthetic Start root, the
/// same currency the cut and the picker use.
///
/// Runs no Significance Test and applies no correction.
#[tauri::command]
pub fn node_distributions(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    columns: Vec<ColumnMapping>,
    attributes: Vec<String>,
    variants: Vec<String>,
    depth: usize,
    scope: Scope,
) -> Result<NodeDistributions, String> {
    let logs = read_groups(&app, &project_id, &groups)?;

    distributions(&logs, &columns, &attributes, &variants, depth, scope)
}

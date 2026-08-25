//! The Comparison Directed Tree seam. Every command here takes Group ids and
//! reads the Parquet each one names — Filter Lists never reach this side, and
//! nothing derived is persisted.
//!
//! `groups` is ordered and holds one or two ids. One is single-Group mode: the
//! tree still renders, with case counts and aggregates but no comparison
//! anywhere. The cap lives here rather than in the payload shape.

use super::distributions::{distributions, NodeDistributions, Scope};
use super::{build, DirectedTree};
use crate::column_mapping::ColumnMapping;
use crate::groups::storage::read_group;
use polars::prelude::DataFrame;

/// The one or two Groups a command was asked for, read from their files.
fn read_groups(
    app: &tauri::AppHandle,
    project_id: &str,
    groups: &[String],
) -> Result<(DataFrame, Option<DataFrame>), String> {
    let Some(first) = groups.first() else {
        return Err("A comparison needs at least one group.".to_string());
    };
    if groups.len() > 2 {
        return Err(format!(
            "Comparing {} groups is not supported yet; pick two.",
            groups.len()
        ));
    }
    let a = read_group(app, project_id, first)?;
    let b = match groups.get(1) {
        Some(id) => Some(read_group(app, project_id, id)?),
        None => None,
    };
    Ok((a, b))
}


/// One Variant as the picker lists it. `key` is what `directed_tree` takes back
/// as a selection and what a terminal node carries, so the two never have to
/// agree on a re-derivation.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VariantRow {
    pub key: String,
    pub activities: Vec<String>,
    pub cases_a: i64,
    pub cases_b: i64,
}

/// Every Variant of the filtered log, most cases first.
///
/// Deliberately not part of `directed_tree`: the picker has to work *before*
/// the first build, and a build only ever ships the Variants it included — so
/// deriving the list from a tree would make every Variant outside the last cut
/// permanently unreachable. This runs no aggregation and no Significance Test,
/// which is what keeps it cheap enough to call on opening a panel.
#[tauri::command]
pub fn list_variants(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<VariantRow>, String> {
    let (a, b) = read_groups(&app, &project_id, &groups)?;

    let mut rows = super::variant_rows(&a, b.as_ref(), &columns)?;
    // Same order the cold-build cut uses, so the list the user sees and the set
    // the backend would have picked rank identically.
    rows.sort_by(|x, y| {
        (y.cases_a + y.cases_b)
            .cmp(&(x.cases_a + x.cases_b))
            .then_with(|| x.key.cmp(&y.key))
    });
    Ok(rows)
}

/// Builds the whole tree in one pass: every Node Aggregate, Significance Test
/// and Co-movement pair ships with it.
///
/// `variants` is the set the picker has checked, by Variant key. It cuts before
/// any aggregation, so the Significance Tests describe the Variants included
/// rather than every Variant the log has. `None` is a cold build, which opens
/// on the Variants covering most of the cases.
#[tauri::command]
pub fn directed_tree(
    app: tauri::AppHandle,
    project_id: String,
    groups: Vec<String>,
    attributes: Vec<String>,
    columns: Vec<ColumnMapping>,
    variants: Option<Vec<String>>,
) -> Result<DirectedTree, String> {
    let (a, b) = read_groups(&app, &project_id, &groups)?;

    build(
        &a,
        b.as_ref(),
        &columns,
        &attributes,
        variants.as_deref(),
    )
}

/// One node's Distributions — value counts per attribute, per Group, under one
/// Scope. Deliberately not part of `directed_tree`; see
/// `docs/adr/0003-query-distributions-on-demand.md`.
///
/// The node is named by `variants` — the Variant keys of every visible leaf in
/// its subtree — and `depth`, its distance from the synthetic Start root. That
/// is the same currency the cut and the picker use, so node identity is never
/// re-derived from activity labels here.
///
/// Runs no Significance Test and applies no correction: a Distribution
/// describes a shape rather than comparing two of them.
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
    let (a, b) = read_groups(&app, &project_id, &groups)?;

    distributions(
        &a,
        b.as_ref(),
        &columns,
        &attributes,
        &variants,
        depth,
        scope,
    )
}

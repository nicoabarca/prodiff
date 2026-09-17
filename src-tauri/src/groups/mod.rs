//! A Group is a named set of cases: the Original, or a Filter List applied to
//! the Event Log and written to `groups/{group_id}.parquet`.

pub mod commands;
pub mod storage;

use crate::column_mapping::ColumnMapping;
use crate::filters::queries::{filtered, read_event_log};
use crate::filters::Filter;
use crate::stats::{summarize, EventLogStats};
use std::path::Path;
use storage::write_group;

/// A Group to apply: its id and the Filter List that defines it.
#[derive(serde::Deserialize, Debug, Clone)]
pub struct GroupFilters {
    pub id: String,
    pub filters: Vec<Filter>,
}

/// Runs a Group's Filter List over the Event Log in `project_dir`, writes the
/// result as Parquet and returns its figures.
pub fn apply(
    project_dir: &Path,
    group_id: &str,
    filters: &[Filter],
    columns: &[ColumnMapping],
) -> Result<EventLogStats, String> {
    let df = read_event_log(project_dir)?;
    let mut applied = filtered(project_dir, &df, filters, columns)?;
    write_group(project_dir, group_id, &mut applied)?;
    summarize(&applied, columns)
}

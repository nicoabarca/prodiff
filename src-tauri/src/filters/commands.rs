//! The filter seam: the two commands that still take a Filter List rather than
//! a Group id, plus the pickers the editor fills its controls from.
//!
//! Rust is stateless here — the frontend owns the `groups` table and hands over
//! whole Filter Lists, and nothing derived from one is persisted on this side.
//! Materializing a Filter List is `groups::commands::apply_group`.

use super::queries::{
    case_durations, case_spans, cell_to_string, count_values, daily_load, filtered, histogram,
    measure, read_event_log,
};
use super::structs::{ChainStep, DayLoad, DistinctValues, DurationBin, PreviewTable};
use super::Endpoint;
use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::filters::Filter;

/// How much of the log survives each prefix of a Filter List. Index 0 is the
/// unfiltered log and index `i + 1` the result after filter `i`, so the editor
/// can show what each filter removes on its own as well as cumulatively.
///
/// Filters are applied one at a time rather than as a whole list because the
/// intermediate sizes are the point. This is the draft preview: it writes
/// nothing, and the numbers it returns belong to the draft, not to a Group.
#[tauri::command]
pub fn filters_impact(
    app: tauri::AppHandle,
    project_id: String,
    filters: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<ChainStep>, String> {
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let mut df = read_event_log(&app, &project_id)?;

    let mut steps = Vec::with_capacity(filters.len() + 1);
    steps.push(measure(&df, case_col)?);
    for filter in &filters {
        df = filtered(&df, std::slice::from_ref(filter), &columns)?;
        steps.push(measure(&df, case_col)?);
    }
    Ok(steps)
}

/// Cases present in both Filter Lists. Groups are unrelated to each other, so
/// overlap can only come from a case matching both sets of filters.
#[tauri::command]
pub fn shared_cases(
    app: tauri::AppHandle,
    project_id: String,
    chain_a: Vec<Filter>,
    chain_b: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<i64, String> {
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let df = read_event_log(&app, &project_id)?;

    let ids = |chain: &[Filter]| -> Result<std::collections::HashSet<String>, String> {
        let filtered = filtered(&df, chain, &columns)?;
        let column = filtered.column(case_col).map_err(|e| e.to_string())?;
        Ok((0..filtered.height())
            .map(|i| cell_to_string(column, i))
            .collect())
    };

    let a = ids(&chain_a)?;
    let b = ids(&chain_b)?;
    Ok(b.iter().filter(|id| a.contains(*id)).count() as i64)
}

/// The distribution of case durations under a Filter List — the shape the
/// duration filter's brush selects a range from.
#[tauri::command]
pub fn duration_histogram(
    app: tauri::AppHandle,
    project_id: String,
    chain: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<DurationBin>, String> {
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let timestamp_col = require_role(&columns, ColumnRole::CompleteTimestamp)?;
    let df = filtered(&read_event_log(&app, &project_id)?, &chain, &columns)?;
    Ok(histogram(&case_durations(df, case_col, timestamp_col)?))
}

/// How many cases are open on each day the log covers — the shape the timeframe
/// filter's brush selects a window from. Every day between the first and last
/// is present, including the quiet ones, so the chart has no gaps to invent.
#[tauri::command]
pub fn daily_case_load(
    app: tauri::AppHandle,
    project_id: String,
    chain: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<DayLoad>, String> {
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let timestamp_col = require_role(&columns, ColumnRole::CompleteTimestamp)?;
    let df = filtered(&read_event_log(&app, &project_id)?, &chain, &columns)?;
    Ok(daily_load(&case_spans(df, case_col, timestamp_col)?))
}

#[tauri::command]
pub fn group_preview(
    app: tauri::AppHandle,
    project_id: String,
    filters: Vec<Filter>,
    columns: Vec<ColumnMapping>,
    limit: usize,
) -> Result<PreviewTable, String> {
    let df = filtered(&read_event_log(&app, &project_id)?, &filters, &columns)?;
    let total_events = df.height();
    let page = df.head(Some(limit));

    let names: Vec<String> = page
        .get_column_names()
        .iter()
        .map(|n| n.to_string())
        .collect();
    let columns: Vec<_> = names
        .iter()
        .map(|n| page.column(n).map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    let rows = (0..page.height())
        .map(|i| columns.iter().map(|c| cell_to_string(c, i)).collect())
        .collect();

    Ok(PreviewTable {
        columns: names,
        rows,
        total_events,
    })
}

/// Distinct values of a column, alphabetical.
///
/// `endpoint` narrows the picker to what an endpoint filter can actually match:
/// only the activities cases begin (or end) with. Offering every activity there
/// invites selections that silently keep nothing.
#[tauri::command]
pub fn distinct_values(
    app: tauri::AppHandle,
    project_id: String,
    column: String,
    columns: Vec<ColumnMapping>,
    limit: usize,
    endpoint: Option<Endpoint>,
) -> Result<DistinctValues, String> {
    let df = read_event_log(&app, &project_id)?;
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    count_values(df, &column, case_col, endpoint, limit)
}

//! The filter seam. Rust is stateless here: the frontend owns the slices table
//! and hands over whole filter chains, so these commands never touch sqlite and
//! nothing derived from a chain is persisted.

use super::{apply, Endpoint, Filter};
use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::event_log::storage::event_log_path;
use crate::stats::{summarize, EventLogStats};
use polars::prelude::*;

fn read_event_log(app: &tauri::AppHandle, project_id: &str) -> Result<DataFrame, String> {
    let path = event_log_path(app, project_id)?;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    ParquetReader::new(file).finish().map_err(|e| e.to_string())
}

fn filtered(
    df: &DataFrame,
    chain: &[Filter],
    columns: &[ColumnMapping],
) -> Result<DataFrame, String> {
    apply(df.clone().lazy(), chain, columns)?
        .collect()
        .map_err(|e| e.to_string())
}

/// Cells cross the seam as display strings. Polars quotes its string values in
/// `Display`, which would otherwise reach the table as `"Gold"`.
fn cell_to_string(column: &Column, row: usize) -> String {
    match column.get(row) {
        Ok(AnyValue::Null) | Err(_) => String::new(),
        Ok(value) => value.to_string().trim_matches('"').to_string(),
    }
}

/// Statistics for several chains at once. Batched deliberately: the Statistics
/// view asks for the whole log, the base and every slice on each render, and
/// this way they share one read of the Parquet file.
///
/// A slice's chain arrives already composed — the frontend prepends the base
/// chain — so the ordering rules live in one place on that side.
#[tauri::command]
pub fn slice_stats(
    app: tauri::AppHandle,
    project_id: String,
    chains: Vec<Vec<Filter>>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<EventLogStats>, String> {
    let df = read_event_log(&app, &project_id)?;
    chains
        .iter()
        .map(|chain| summarize(&filtered(&df, chain, &columns)?, &columns))
        .collect()
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChainStep {
    pub cases: i64,
    pub events: i64,
}

fn measure(df: &DataFrame, case_col: &str) -> Result<ChainStep, String> {
    Ok(ChainStep {
        cases: df
            .column(case_col)
            .map_err(|e| e.to_string())?
            .n_unique()
            .map_err(|e| e.to_string())? as i64,
        events: df.height() as i64,
    })
}

/// How much of the log survives each prefix of a chain. Index 0 is the
/// unfiltered log and index `i + 1` the result after filter `i`, so the editor
/// can show what each filter removes on its own as well as cumulatively.
///
/// Filters are applied one at a time rather than as a whole chain because the
/// intermediate sizes are the point.
#[tauri::command]
pub fn chain_impact(
    app: tauri::AppHandle,
    project_id: String,
    chain: Vec<Filter>,
    columns: Vec<ColumnMapping>,
) -> Result<Vec<ChainStep>, String> {
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let mut df = read_event_log(&app, &project_id)?;

    let mut steps = Vec::with_capacity(chain.len() + 1);
    steps.push(measure(&df, case_col)?);
    for filter in &chain {
        df = filtered(&df, std::slice::from_ref(filter), &columns)?;
        steps.push(measure(&df, case_col)?);
    }
    Ok(steps)
}

/// Cases present in both chains — the two are unrelated slices (Base is
/// prepended by the frontend into each already), so overlap can only come
/// from a case matching both sets of filters.
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

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTable {
    pub columns: Vec<String>,
    /// Every cell rendered as a string — the table displays them verbatim and
    /// typed values would only have to be re-formatted on the other side.
    pub rows: Vec<Vec<String>>,
    pub total_events: usize,
}

#[tauri::command]
pub fn slice_preview(
    app: tauri::AppHandle,
    project_id: String,
    chain: Vec<Filter>,
    columns: Vec<ColumnMapping>,
    limit: usize,
) -> Result<PreviewTable, String> {
    let df = filtered(&read_event_log(&app, &project_id)?, &chain, &columns)?;
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

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ValueCount {
    pub value: String,
    /// How many distinct cases contain at least one event with this value —
    /// the figure that matters when picking values for a case-level filter.
    pub cases: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DistinctValues {
    pub values: Vec<ValueCount>,
    /// True when the column has more distinct values than `limit`. The picker
    /// shows the most common ones rather than refusing to open on a
    /// high-cardinality column such as the case id.
    pub truncated: bool,
}

/// Distinct values of a column, most common first.
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

fn count_values(
    df: DataFrame,
    column: &str,
    case_col: &str,
    endpoint: Option<Endpoint>,
    limit: usize,
) -> Result<DistinctValues, String> {
    if df.column(column).is_err() {
        return Err(format!("Column \"{column}\" is not in this event log."));
    }

    // Rows are persisted sorted by (case, timestamp), so first/last within the
    // case group are the case's endpoints — one row per case, then counted as
    // usual so `cases` reads as "cases starting/ending with this activity".
    let base = match endpoint {
        None => df.lazy(),
        Some(position) => {
            let pick = match position {
                Endpoint::Start => col(column).first(),
                Endpoint::End => col(column).last(),
            };
            df.lazy()
                .group_by([col(case_col)])
                .agg([pick.alias(column)])
        }
    };

    let counted = base
        .group_by([col(column)])
        .agg([col(case_col).n_unique().alias("cases")])
        .sort(
            ["cases"],
            SortMultipleOptions::default().with_order_descending(true),
        )
        .collect()
        .map_err(|e| e.to_string())?;

    let total = counted.height();
    let page = counted.head(Some(limit));
    let value_column = page.column(column).map_err(|e| e.to_string())?;
    let cases = page
        .column("cases")
        .map_err(|e| e.to_string())?
        .cast(&DataType::Int64)
        .map_err(|e| e.to_string())?;
    let cases = cases.i64().map_err(|e| e.to_string())?;

    Ok(DistinctValues {
        values: (0..page.height())
            .filter_map(|i| {
                // Nulls aren't selectable values — a filter on "no value" is a
                // different feature.
                let value = cell_to_string(value_column, i);
                if value.is_empty() {
                    return None;
                }
                Some(ValueCount {
                    value,
                    cases: cases.get(i).unwrap_or(0),
                })
            })
            .collect(),
        truncated: total > limit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// case 1: A → B    case 2: A → C    case 3: B
    fn log() -> DataFrame {
        DataFrame::new(
            5,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3"]),
                Column::new("act".into(), ["A", "B", "A", "C", "B"]),
            ],
        )
        .unwrap()
    }

    fn values(endpoint: Option<Endpoint>) -> Vec<(String, i64)> {
        let mut out: Vec<(String, i64)> = count_values(log(), "act", "case", endpoint, 100)
            .unwrap()
            .values
            .into_iter()
            .map(|v| (v.value, v.cases))
            .collect();
        out.sort();
        out
    }

    #[test]
    fn endpoint_narrows_to_activities_cases_actually_begin_and_end_with() {
        // Unconstrained, every activity is offered.
        assert_eq!(
            values(None),
            [("A".into(), 2), ("B".into(), 2), ("C".into(), 1)]
        );
        // C never starts a case; A never ends one. Case 3 is one event long, so
        // its B counts on both sides.
        assert_eq!(
            values(Some(Endpoint::Start)),
            [("A".into(), 2), ("B".into(), 1)]
        );
        assert_eq!(
            values(Some(Endpoint::End)),
            [("B".into(), 2), ("C".into(), 1)]
        );
    }
}

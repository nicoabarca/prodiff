//! Non-command support code for the filter commands: reading the log,
//! applying a chain, and the per-command aggregations.

use super::structs::{ChainStep, DayLoad, DistinctValues, DurationBin};
use super::{apply, timestamp_millis, Endpoint, Filter};
use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::event_log_path;
use polars::prelude::*;

pub fn read_event_log(app: &tauri::AppHandle, project_id: &str) -> Result<DataFrame, String> {
    let path = event_log_path(app, project_id)?;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    ParquetReader::new(file).finish().map_err(|e| e.to_string())
}

pub fn filtered(
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
pub fn cell_to_string(column: &Column, row: usize) -> String {
    match column.get(row) {
        Ok(AnyValue::Null) | Err(_) => String::new(),
        Ok(value) => value.to_string().trim_matches('"').to_string(),
    }
}

pub fn measure(df: &DataFrame, case_col: &str) -> Result<ChainStep, String> {
    Ok(ChainStep {
        cases: df
            .column(case_col)
            .map_err(|e| e.to_string())?
            .n_unique()
            .map_err(|e| e.to_string())? as i64,
        events: df.height() as i64,
    })
}

/// One `(first event, last event)` pair per case, in epoch milliseconds.
pub fn case_spans(
    df: DataFrame,
    case_col: &str,
    timestamp_col: &str,
) -> Result<Vec<(i64, i64)>, String> {
    let millis = timestamp_millis(timestamp_col).cast(DataType::Int64);
    let per_case = df
        .lazy()
        .group_by([col(case_col)])
        .agg([
            millis.clone().min().alias("start_ms"),
            millis.max().alias("end_ms"),
        ])
        .collect()
        .map_err(|e| e.to_string())?;
    let column = |name: &str| -> Result<Vec<i64>, String> {
        Ok(per_case
            .column(name)
            .map_err(|e| e.to_string())?
            .i64()
            .map_err(|e| e.to_string())?
            .into_no_null_iter()
            .collect())
    };
    Ok(column("start_ms")?
        .into_iter()
        .zip(column("end_ms")?)
        .collect())
}

/// One duration per case, in milliseconds: its last event minus its first.
pub fn case_durations(
    df: DataFrame,
    case_col: &str,
    timestamp_col: &str,
) -> Result<Vec<i64>, String> {
    Ok(case_spans(df, case_col, timestamp_col)?
        .into_iter()
        .map(|(start, end)| end - start)
        .collect())
}

pub const DAY_MS: i64 = 86_400_000;

/// Counted by the difference of a running total rather than by walking each
/// case's days: a long case would otherwise cost a step per day it spans.
pub fn daily_load(spans: &[(i64, i64)]) -> Vec<DayLoad> {
    let day = |millis: i64| millis.div_euclid(DAY_MS);
    let (Some(first), Some(last)) = (
        spans.iter().map(|(start, _)| day(*start)).min(),
        spans.iter().map(|(_, end)| day(*end)).max(),
    ) else {
        return Vec::new();
    };

    let mut deltas = vec![0i64; (last - first + 2) as usize];
    for (start, end) in spans {
        deltas[(day(*start) - first) as usize] += 1;
        deltas[(day(*end) - first + 1) as usize] -= 1;
    }

    let mut running = 0;
    deltas
        .into_iter()
        .take((last - first + 1) as usize)
        .enumerate()
        .map(|(offset, delta)| {
            running += delta;
            DayLoad {
                day_ms: (first + offset as i64) * DAY_MS,
                cases: running,
            }
        })
        .collect()
}

/// How many bins the case-duration histogram is drawn with. Fixed here rather
/// than passed in: it is a property of the chart, and the chart is the only
/// caller.
pub const DURATION_BINS: usize = 60;

/// Equal-width bins over the observed range. A log where every case shares one
/// duration still gets a single bin rather than a zero-width division.
pub fn histogram(durations: &[i64]) -> Vec<DurationBin> {
    let (Some(min), Some(max)) = (durations.iter().min(), durations.iter().max()) else {
        return Vec::new();
    };
    let (min, max) = (*min as f64, *max as f64);
    let count = if min == max { 1 } else { DURATION_BINS };
    let width = if min == max {
        1.0
    } else {
        (max - min) / count as f64
    };

    let mut cases = vec![0i64; count];
    for value in durations {
        let offset = ((*value as f64 - min) / width) as usize;
        cases[offset.min(count - 1)] += 1;
    }
    // Edges are interpolated rather than stepped by `width` so the last one
    // lands exactly on `max` instead of a rounding error past it.
    let edge = |i: usize| min + (max - min) * i as f64 / count as f64;
    cases
        .into_iter()
        .enumerate()
        .map(|(i, cases)| DurationBin {
            start_ms: edge(i),
            end_ms: if min == max { min + 1.0 } else { edge(i + 1) },
            cases,
        })
        .collect()
}

/// Distinct values of a column, alphabetical.
///
/// `endpoint` narrows the picker to what an endpoint filter can actually match:
/// only the activities cases begin (or end) with. Offering every activity there
/// invites selections that silently keep nothing.
pub fn count_values(
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
    // case group are the case's endpoints — one row per case, so a value only
    // counts here when some case actually starts/ends with it.
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

    let distinct = base
        .select([col(column)])
        .unique(None, UniqueKeepStrategy::First)
        .sort([column], SortMultipleOptions::default())
        .collect()
        .map_err(|e| e.to_string())?;

    let total = distinct.height();
    let page = distinct.head(Some(limit));
    let value_column = page.column(column).map_err(|e| e.to_string())?;

    Ok(DistinctValues {
        values: (0..page.height())
            .filter_map(|i| {
                // Nulls aren't selectable values — a filter on "no value" is a
                // different feature.
                let value = cell_to_string(value_column, i);
                if value.is_empty() {
                    return None;
                }
                Some(value)
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

    fn values(endpoint: Option<Endpoint>) -> Vec<String> {
        let mut out = count_values(log(), "act", "case", endpoint, 100)
            .unwrap()
            .values;
        out.sort();
        out
    }

    #[test]
    fn histogram_bins_cover_the_whole_range_and_count_every_case() {
        let durations = [0, 50, 100, 999, 1000];
        let bins = histogram(&durations);
        assert_eq!(bins.len(), DURATION_BINS);
        assert_eq!(bins[0].start_ms, 0.0);
        assert_eq!(bins[DURATION_BINS - 1].end_ms, 1000.0);
        // The longest case lands in the last bin rather than one past the end,
        // alongside the 999 that shares that bin.
        assert_eq!(bins.iter().map(|b| b.cases).sum::<i64>(), 5);
        assert_eq!(bins[DURATION_BINS - 1].cases, 2);
    }

    #[test]
    fn a_single_shared_duration_yields_one_bin_rather_than_a_zero_width_split() {
        assert_eq!(
            histogram(&[7, 7, 7]),
            [DurationBin {
                start_ms: 7.0,
                end_ms: 8.0,
                cases: 3
            }]
        );
        assert!(histogram(&[]).is_empty());
    }

    #[test]
    fn daily_load_counts_a_case_on_every_day_it_is_open() {
        // One case spanning days 0–2, one on day 1 only.
        let load = daily_load(&[(0, 2 * DAY_MS), (DAY_MS, DAY_MS + 5)]);
        assert_eq!(
            load.iter().map(|d| (d.day_ms, d.cases)).collect::<Vec<_>>(),
            [(0, 1), (DAY_MS, 2), (2 * DAY_MS, 1)]
        );
        assert!(daily_load(&[]).is_empty());
    }

    #[test]
    fn endpoint_narrows_to_activities_cases_actually_begin_and_end_with() {
        // Unconstrained, every activity is offered.
        assert_eq!(values(None), ["A", "B", "C"]);
        // C never starts a case; A never ends one. Case 3 is one event long, so
        // its B is offered on both sides.
        assert_eq!(values(Some(Endpoint::Start)), ["A", "B"]);
        assert_eq!(values(Some(Endpoint::End)), ["B", "C"]);
    }
}

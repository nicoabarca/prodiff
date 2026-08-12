//! The `Duration` filter: a case's lifetime, its last event minus its first,
//! measured in days.

use super::enums::NumericMode;
use super::predicates::{numeric_predicate, timestamp_millis};
use polars::prelude::*;

pub fn apply(
    lf: LazyFrame,
    mode: NumericMode,
    min: Option<f64>,
    max: Option<f64>,
    case_col: &str,
    timestamp_col: &str,
) -> Result<LazyFrame, String> {
    // Rows are sorted by (case, timestamp), so last - first over the case
    // window is its lifetime without re-sorting (see the endpoint filter).
    // The result is already one scalar per case, broadcast to every row of
    // it, so no further per-case lift is needed before filtering.
    let ts = timestamp_millis(timestamp_col).cast(DataType::Int64);
    let span_millis = (ts.clone().last() - ts.first())
        .over([col(case_col)])
        .map_err(|e| e.to_string())?;
    let duration_days = span_millis.cast(DataType::Float64) / lit(86_400_000.0);
    Ok(lf.filter(numeric_predicate(duration_days, mode, min, max)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::cases;

    const DAY_MS: i64 = 86_400_000;

    /// case 1: spans exactly 30 days. case 2: spans 15 days. case 3: a single
    /// event, so 0 days. case 4: spans 45 days.
    fn duration_log() -> DataFrame {
        let ts = Column::new(
            "ts".into(),
            [0i64, 30 * DAY_MS, 0, 15 * DAY_MS, 0, 0, 45 * DAY_MS],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .unwrap();
        DataFrame::new(
            7,
            vec![
                Column::new("case".into(), ["1", "1", "2", "2", "3", "4", "4"]),
                Column::new("act".into(), ["A", "B", "A", "B", "A", "A", "B"]),
                ts,
            ],
        )
        .unwrap()
    }

    fn run(mode: NumericMode, min: Option<f64>, max: Option<f64>) -> DataFrame {
        apply(duration_log().lazy(), mode, min, max, "case", "ts")
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn duration_between_includes_the_limits() {
        // 30 and 0 are on the limits, 15 is inside; 45 is outside.
        let df = run(NumericMode::Between, Some(0.0), Some(30.0));
        assert_eq!(cases(&df), ["1", "2", "3"]);
    }

    #[test]
    fn duration_outside_excludes_the_limits() {
        let df = run(NumericMode::Outside, Some(0.0), Some(30.0));
        assert_eq!(cases(&df), ["4"]);
    }

    #[test]
    fn duration_above_and_below_use_one_bound() {
        let above = run(NumericMode::Above, Some(40.0), None);
        assert_eq!(cases(&above), ["4"]);
        let below = run(NumericMode::Below, None, Some(0.0));
        assert_eq!(cases(&below), ["3"]);
    }
}

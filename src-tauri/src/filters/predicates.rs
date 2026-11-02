//! Polars `Expr` builders behind the Filter-predicate seam: shared by the
//! attribute/numeric/timeframe/duration/follower/endpoint modules.

use crate::column_mapping::CaseResolution;
use polars::prelude::*;

/// `value` is one of `values`. An OR chain, so the expression is independent of
/// Polars' shifting `is_in` signature.
pub fn matches_any_of(value: Expr, values: &[String]) -> Expr {
    values.iter().fold(lit(false), |acc, v| {
        acc.or(value.clone().eq(lit(v.as_str())))
    })
}

pub fn matches_any(column: &str, values: &[String]) -> Expr {
    matches_any_of(col(column), values)
}

pub fn timestamp_millis(column: &str) -> Expr {
    col(column).cast(DataType::Datetime(TimeUnit::Milliseconds, None))
}

use super::enums::NumericMode;

pub fn numeric_predicate(
    value: Expr,
    mode: NumericMode,
    min: Option<f64>,
    max: Option<f64>,
) -> Expr {
    match mode {
        NumericMode::Above => match min {
            Some(m) => value.gt_eq(lit(m)),
            None => lit(true),
        },
        NumericMode::Below => match max {
            Some(m) => value.lt_eq(lit(m)),
            None => lit(true),
        },
        NumericMode::Between => match (min, max) {
            (Some(lo), Some(hi)) => value.clone().gt_eq(lit(lo)).and(value.lt_eq(lit(hi))),
            (Some(lo), None) => value.gt_eq(lit(lo)),
            (None, Some(hi)) => value.lt_eq(lit(hi)),
            (None, None) => lit(true),
        },
        NumericMode::Outside => match (min, max) {
            (Some(lo), Some(hi)) => value.clone().lt(lit(lo)).or(value.gt(lit(hi))),
            (Some(lo), None) => value.lt(lit(lo)),
            (None, Some(hi)) => value.gt(lit(hi)),
            (None, None) => lit(true),
        },
    }
}

/// Lifts an event-level predicate to "every / at least one event of the case
/// satisfies it".
pub fn per_case(predicate: Expr, case_col: &str, all: bool) -> Result<Expr, String> {
    let quantified = if all {
        predicate.all(true)
    } else {
        predicate.any(true)
    };
    quantified.over([col(case_col)]).map_err(|e| e.to_string())
}

/// The one value a case-scoped column holds for a case, as an aggregation over
/// the case's rows. Rows run in timestamp order within a case.
pub fn resolved_value(value: Expr, resolution: CaseResolution) -> Expr {
    match resolution {
        CaseResolution::Constant | CaseResolution::First => value.first_non_null(),
        CaseResolution::Last => value.last_non_null(),
    }
}

/// Whether each row's case satisfies `test`. A case-scoped column tests the
/// case's resolved value, and a case with no value does not match. An
/// event-scoped column (`resolution` is `None`) tests every event, and one match
/// is enough.
pub fn case_matches(
    value: Expr,
    resolution: Option<CaseResolution>,
    case_col: &str,
    test: impl FnOnce(Expr) -> Expr,
) -> Result<Expr, String> {
    match resolution {
        None => per_case(test(value), case_col, false),
        Some(resolution) => test(resolved_value(value, resolution))
            .fill_null(lit(false))
            .over([col(case_col)])
            .map_err(|e| e.to_string()),
    }
}

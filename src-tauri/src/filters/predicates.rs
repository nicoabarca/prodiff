//! Polars `Expr` builders behind the Filter-predicate seam: shared by the
//! attribute/numeric/timeframe/duration/follower/endpoint modules.

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

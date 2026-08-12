//! The `Numeric` filter: a case matches when at least one event's column
//! value satisfies the comparison.

use super::enums::NumericMode;
use super::predicates::{numeric_predicate, per_case};
use polars::prelude::*;

pub fn apply(
    lf: LazyFrame,
    column: &str,
    mode: NumericMode,
    min: Option<f64>,
    max: Option<f64>,
    case_col: &str,
) -> Result<LazyFrame, String> {
    let value = col(column).cast(DataType::Float64);
    let hit = numeric_predicate(value, mode, min, max);
    Ok(lf.filter(per_case(hit, case_col, false)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::{cases, log};

    fn run(mode: NumericMode, min: Option<f64>, max: Option<f64>) -> DataFrame {
        apply(log().lazy(), "amount", mode, min, max, "case")
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn numeric_between_includes_the_limits() {
        let df = run(NumericMode::Between, Some(10.0), Some(20.0));
        // Case 1 (10) and case 2 (20) each have an event on a limit.
        assert_eq!(cases(&df), ["1", "2"]);
    }

    #[test]
    fn numeric_outside_excludes_the_limits() {
        let df = run(NumericMode::Outside, Some(10.0), Some(20.0));
        // 10 and 20 are not outside; only 50, 30 and 90 are.
        assert_eq!(cases(&df), ["1", "2", "3"]);
    }

    #[test]
    fn numeric_above_and_below_use_one_bound() {
        let above = run(NumericMode::Above, Some(50.0), None);
        assert_eq!(cases(&above), ["1", "3"]);
        let below = run(NumericMode::Below, None, Some(20.0));
        assert_eq!(cases(&below), ["1", "2"]);
    }
}

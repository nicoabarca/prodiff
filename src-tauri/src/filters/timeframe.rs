//! The `Timeframe` filter: a case's events measured against a `from..to`
//! epoch-millisecond window.

use super::enums::TimeframeMode;
use super::predicates::{per_case, timestamp_millis};
use polars::prelude::*;

pub fn apply(
    lf: LazyFrame,
    mode: TimeframeMode,
    from: i64,
    to: i64,
    case_col: &str,
    timestamp_col: &str,
) -> Result<LazyFrame, String> {
    let ts = timestamp_millis(timestamp_col).cast(DataType::Int64);
    let inside = ts.clone().gt_eq(lit(from)).and(ts.lt_eq(lit(to)));
    Ok(match mode {
        TimeframeMode::Intersects => lf.filter(per_case(inside, case_col, false)?),
        TimeframeMode::Disjoint => lf.filter(per_case(inside, case_col, false)?.not()),
        // Every event inside the window ⇒ the case's whole lifetime is.
        TimeframeMode::Contained => lf.filter(per_case(inside, case_col, true)?),
        TimeframeMode::Trim => lf.filter(inside),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::{cases, log};

    fn run(mode: TimeframeMode, from: i64, to: i64) -> DataFrame {
        apply(log().lazy(), mode, from, to, "case", "ts")
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn timeframe_distinguishes_intersecting_from_contained() {
        // Window covers ts 1000..2500: case 1 straddles it, case 2 does too.
        let intersects = run(TimeframeMode::Intersects, 1000, 2500);
        assert_eq!(cases(&intersects), ["1", "2"]);
        // Nothing is fully inside that window, but case 1 is inside 0..1000.
        assert!(cases(&run(TimeframeMode::Contained, 1000, 2500)).is_empty());
        let contained = run(TimeframeMode::Contained, 0, 1000);
        assert_eq!(cases(&contained), ["1"]);
    }

    #[test]
    fn timeframe_disjoint_and_trim() {
        let disjoint = run(TimeframeMode::Disjoint, 0, 1000);
        assert_eq!(cases(&disjoint), ["2", "3"]);
        let trim = run(TimeframeMode::Trim, 1000, 3000);
        assert_eq!(trim.height(), 3);
    }
}

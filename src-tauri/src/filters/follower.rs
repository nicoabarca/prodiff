//! The `Follower` filter: whether a reference event is followed by a follower
//! event in the same case, and how closely.

use super::enums::FollowerMode;
use super::predicates::{matches_any_of, per_case};
use polars::prelude::*;

pub fn apply(
    lf: LazyFrame,
    column: &str,
    mode: FollowerMode,
    reference: &[String],
    follower: &[String],
    case_col: &str,
) -> Result<LazyFrame, String> {
    // Compared as text for the same reason the endpoint filter does: the
    // values arrive as the display strings the picker showed, and a column
    // of numeric codes is stored as a number.
    let as_text = col(column).cast(DataType::String);
    let is_reference = matches_any_of(as_text.clone(), reference);
    let is_follower = matches_any_of(as_text, follower);

    let pair = match mode {
        FollowerMode::Eventually | FollowerMode::NeverEventually => {
            // A running count of reference events, minus this row's own
            // contribution: positive means one came strictly before.
            let counted = is_reference.clone().cast(DataType::Int32);
            let before = (counted.clone().cum_sum(false) - counted)
                .over([col(case_col)])
                .map_err(|e| e.to_string())?;
            is_follower.and(before.gt(lit(0)))
        }
        FollowerMode::Directly | FollowerMode::NeverDirectly => {
            // The first row of a case shifts in a null, which is not a
            // reference event.
            let previous = is_reference
                .shift(lit(1))
                .over([col(case_col)])
                .map_err(|e| e.to_string())?;
            is_follower.and(previous.fill_null(lit(false)))
        }
    };

    let matched = per_case(pair, case_col, false)?;
    Ok(match mode {
        FollowerMode::Eventually | FollowerMode::Directly => lf.filter(matched),
        FollowerMode::NeverEventually | FollowerMode::NeverDirectly => lf.filter(matched.not()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::cases;

    /// case 1: A → X → B  (B follows A, but not directly)
    /// case 2: A → B      (directly)
    /// case 3: B → A      (the follower comes first, so no pair at all)
    /// case 4: X → Y      (no reference event whatsoever)
    fn follower_log() -> DataFrame {
        let ts = Column::new(
            "ts".into(),
            [0i64, 1_000, 2_000, 0, 1_000, 0, 1_000, 0, 1_000],
        )
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .unwrap();
        DataFrame::new(
            9,
            vec![
                Column::new("case".into(), ["1", "1", "1", "2", "2", "3", "3", "4", "4"]),
                Column::new("act".into(), ["A", "X", "B", "A", "B", "B", "A", "X", "Y"]),
                ts,
            ],
        )
        .unwrap()
    }

    fn run(mode: FollowerMode) -> Vec<String> {
        let df = apply(
            follower_log().lazy(),
            "act",
            mode,
            &["A".to_string()],
            &["B".to_string()],
            "case",
        )
        .unwrap()
        .collect()
        .unwrap();
        cases(&df)
    }

    #[test]
    fn eventually_followed_accepts_a_gap_that_directly_followed_rejects() {
        assert_eq!(run(FollowerMode::Eventually), ["1", "2"]);
        assert_eq!(run(FollowerMode::Directly), ["2"]);
    }

    #[test]
    fn the_never_modes_are_the_exact_complement_and_keep_cases_without_a_reference() {
        // Case 3 has both values but in the wrong order; case 4 has no A at all.
        assert_eq!(run(FollowerMode::NeverEventually), ["3", "4"]);
        assert_eq!(run(FollowerMode::NeverDirectly), ["1", "3", "4"]);
    }

    #[test]
    fn a_follower_pair_is_looked_for_within_one_case_only() {
        // Case 3's A is last, so the B of no later case may pair with it.
        assert!(!run(FollowerMode::Eventually).contains(&"3".to_string()));
    }
}

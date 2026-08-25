//! `case_not_in_group`: keeps the cases that are *not* in another Group.
//!
//! Set difference over case ids rather than a negated predicate, because a
//! Filter List is an AND pipeline and the model has no OR — negating
//! `[premium = gold, region = north]` term by term gives a different, smaller
//! set, and the trim modes have no complement at all. See `docs/adr/0006`.
//!
//! Unlike every other kind, this one reads nothing from the row it filters: the
//! excluded case ids are resolved before the pipeline runs and handed in.

use polars::prelude::*;
use std::collections::HashSet;

pub fn apply(lf: LazyFrame, excluded: &HashSet<String>, case_col: &str) -> Result<LazyFrame, String> {
    // An empty exclusion set keeps everything, which is what an unapplied
    // Group means here: it has no cases to take away yet.
    if excluded.is_empty() {
        return Ok(lf);
    }
    let ids: Vec<&str> = excluded.iter().map(String::as_str).collect();
    let ids = Series::new("__excluded".into(), ids);
    Ok(lf.filter(
        col(case_col)
            .cast(DataType::String)
            .is_in(lit(ids).implode(true), false)
            .not(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::{cases, log, mapping};
    use crate::filters::{apply as apply_chain, ExcludedCases, Filter};

    fn run(excluded: &[&str]) -> DataFrame {
        let mut map = ExcludedCases::new();
        map.insert(
            "other".to_string(),
            excluded.iter().map(|id| id.to_string()).collect(),
        );
        let filters: Vec<Filter> = serde_json::from_str(
            r#"[{"kind":"case_not_in_group","groupId":"other"}]"#,
        )
        .unwrap();
        apply_chain(log().lazy(), &filters, &mapping(), &map)
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn drops_every_event_of_an_excluded_case() {
        assert_eq!(cases(&run(&["1"])), vec!["2", "3"]);
    }

    #[test]
    fn excluding_nothing_keeps_the_whole_log() {
        assert_eq!(run(&[]).height(), 5);
    }

    #[test]
    fn an_unknown_case_id_takes_nothing_away() {
        assert_eq!(cases(&run(&["nope"])), vec!["1", "2", "3"]);
    }
}

//! `case_not_in_group` keeps the cases that are *not* in another Group;
//! `case_in_group`, its inverse, keeps only the cases that are. The second is
//! internal: the app adds it to show the cases a Comparison removed, and the
//! filter picker never offers it.
//!
//! Set operations over case ids, not a negated predicate: a Filter List is an
//! AND pipeline with no OR, so negating term by term gives a different set and
//! the trim modes have no complement at all.
//!
//! Unlike every other kind, these read nothing from the row they filter: the
//! named Group's case ids are resolved before the pipeline runs and handed in.

use polars::prelude::*;
use std::collections::HashSet;

fn is_member(members: &HashSet<String>, case_col: &str) -> Expr {
    let ids: Vec<&str> = members.iter().map(String::as_str).collect();
    let ids = Series::new("__members".into(), ids);
    col(case_col)
        .cast(DataType::String)
        .is_in(lit(ids).implode(true), false)
}

pub fn not_in(
    lf: LazyFrame,
    members: &HashSet<String>,
    case_col: &str,
) -> Result<LazyFrame, String> {
    // An empty set keeps everything, which is what an unapplied Group means here.
    if members.is_empty() {
        return Ok(lf);
    }
    Ok(lf.filter(is_member(members, case_col).not()))
}

pub fn in_group(
    lf: LazyFrame,
    members: &HashSet<String>,
    case_col: &str,
) -> Result<LazyFrame, String> {
    Ok(lf.filter(is_member(members, case_col).fill_null(false)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filters::tests::support::{cases, log, mapping};
    use crate::filters::{apply as apply_chain, Filter, GroupCases};

    fn run(kind: &str, members: &[&str]) -> DataFrame {
        let mut map = GroupCases::new();
        map.insert(
            "other".to_string(),
            members.iter().map(|id| id.to_string()).collect(),
        );
        let filters: Vec<Filter> =
            serde_json::from_str(&format!(r#"[{{"kind":"{kind}","groupId":"other"}}]"#)).unwrap();
        apply_chain(log().lazy(), &filters, &mapping(), &map)
            .unwrap()
            .collect()
            .unwrap()
    }

    #[test]
    fn drops_every_event_of_an_excluded_case() {
        assert_eq!(cases(&run("case_not_in_group", &["1"])), vec!["2", "3"]);
    }

    #[test]
    fn excluding_nothing_keeps_the_whole_log() {
        assert_eq!(run("case_not_in_group", &[]).height(), 5);
    }

    #[test]
    fn an_unknown_case_id_takes_nothing_away() {
        assert_eq!(
            cases(&run("case_not_in_group", &["nope"])),
            vec!["1", "2", "3"]
        );
    }

    #[test]
    fn in_group_keeps_every_event_of_a_member_case() {
        let out = run("case_in_group", &["1", "3"]);
        assert_eq!(cases(&out), vec!["1", "3"]);
        assert_eq!(out.height(), 3);
    }

    #[test]
    fn in_an_empty_group_keeps_nothing() {
        assert_eq!(run("case_in_group", &[]).height(), 0);
    }

    #[test]
    fn in_group_is_the_complement_of_not_in_group() {
        let inside = run("case_in_group", &["2"]).height();
        let outside = run("case_not_in_group", &["2"]).height();
        assert_eq!(inside + outside, 5);
    }

    #[test]
    fn a_group_never_applied_holds_no_case() {
        let filters: Vec<Filter> =
            serde_json::from_str(r#"[{"kind":"case_in_group","groupId":"missing"}]"#).unwrap();
        let out = apply_chain(log().lazy(), &filters, &mapping(), &GroupCases::new())
            .unwrap()
            .collect()
            .unwrap();
        assert_eq!(out.height(), 0);
    }
}

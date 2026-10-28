//! The rule that keeps a case off both sides of a Comparison. In a partial
//! overlap both Groups lose the shared cases; when one Group contains the other,
//! only the outer one loses them. Identical Groups, and a Group with no cases,
//! cannot be compared.
//!
//! Cases are removed whole, never event by event. A case id is the cell cast to
//! a string, and a null id belongs to no case, so it is never shared.

use super::GroupLog;
use polars::prelude::*;
use std::collections::HashMap;

/// What `read_groups` answers when asked for a pair the rule refuses.
pub const REFUSED: &str = "These groups cannot be compared. Pick another comparison.";

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Ok,
    Identical,
    Empty,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Relation {
    Disjoint,
    Partial,
    Contained,
    Identical,
}

/// How two Groups relate and what the rule does to each. Every map is keyed by
/// Group id; `kept` and `removed` count cases after and taken away by the rule.
/// `inner` names the contained Group.
#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RelationSummary {
    pub status: Status,
    pub relation: Option<Relation>,
    pub inner: Option<String>,
    pub cases: HashMap<String, i64>,
    pub kept: HashMap<String, i64>,
    pub removed: HashMap<String, i64>,
}

/// The summary, plus the case ids each side loses. A side that loses nothing has
/// no entry in `drop`.
pub(crate) struct Plan {
    pub summary: RelationSummary,
    drop: HashMap<String, Series>,
}

fn case_set(df: &DataFrame, case_col: &str) -> Result<Series, String> {
    df.column(case_col)
        .map_err(|e| e.to_string())?
        .as_materialized_series()
        .cast(&DataType::String)
        .map_err(|e| e.to_string())?
        .drop_nulls()
        .unique()
        .map_err(|e| e.to_string())
}

fn within(values: &Series, set: &Series) -> Result<Series, String> {
    let name = values.name().clone();
    let frame =
        DataFrame::new(values.len(), vec![values.clone().into()]).map_err(|e| e.to_string())?;
    frame
        .lazy()
        .filter(col(name.clone()).is_in(lit(set.clone()).implode(true), false))
        .collect()
        .map_err(|e| e.to_string())?
        .column(&name)
        .map(|c| c.as_materialized_series().clone())
        .map_err(|e| e.to_string())
}

pub(crate) fn plan(first: &GroupLog, second: &GroupLog, case_col: &str) -> Result<Plan, String> {
    let a = case_set(&first.df, case_col)?;
    let b = case_set(&second.df, case_col)?;
    let shared = within(&a, &b)?;
    let (na, nb, ns) = (a.len() as i64, b.len() as i64, shared.len() as i64);
    let (ida, idb) = (first.id.clone(), second.id.clone());

    let (status, relation, losers): (Status, Option<Relation>, Vec<&String>) = if na == 0 || nb == 0
    {
        (Status::Empty, None, vec![])
    } else if ns == na && ns == nb {
        (Status::Identical, Some(Relation::Identical), vec![])
    } else if ns == 0 {
        (Status::Ok, Some(Relation::Disjoint), vec![])
    } else if ns == na.min(nb) {
        let outer = if na > nb { &ida } else { &idb };
        (Status::Ok, Some(Relation::Contained), vec![outer])
    } else {
        (Status::Ok, Some(Relation::Partial), vec![&ida, &idb])
    };

    let inner = (relation == Some(Relation::Contained)).then(|| {
        if na > nb {
            idb.clone()
        } else {
            ida.clone()
        }
    });
    let removed: HashMap<String, i64> = [&ida, &idb]
        .into_iter()
        .map(|id| (id.clone(), if losers.contains(&id) { ns } else { 0 }))
        .collect();
    let cases = HashMap::from([(ida.clone(), na), (idb.clone(), nb)]);
    let kept = cases
        .iter()
        .map(|(id, n)| (id.clone(), n - removed[id]))
        .collect();
    let drop = losers
        .into_iter()
        .map(|id| (id.clone(), shared.clone()))
        .collect();

    Ok(Plan {
        summary: RelationSummary {
            status,
            relation,
            inner,
            cases,
            kept,
            removed,
        },
        drop,
    })
}

/// The two sides with the rule applied, in the order given.
pub(crate) fn reduce(logs: Vec<GroupLog>, case_col: &str) -> Result<Vec<GroupLog>, String> {
    let [first, second]: [GroupLog; 2] = logs
        .try_into()
        .map_err(|_| "A reduction takes two groups.".to_string())?;
    let plan = plan(&first, &second, case_col)?;
    if plan.summary.status != Status::Ok {
        return Err(REFUSED.to_string());
    }
    [first, second]
        .into_iter()
        .map(|log| {
            let Some(ids) = plan.drop.get(&log.id) else {
                return Ok(log);
            };
            let df = log
                .df
                .lazy()
                .filter(
                    col(case_col)
                        .cast(DataType::String)
                        .is_in(lit(ids.clone()).implode(true), false)
                        .fill_null(lit(false))
                        .not(),
                )
                .collect()
                .map_err(|e| e.to_string())?;
            Ok(GroupLog { id: log.id, df })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn log(id: &str, cases: &[Option<&str>]) -> GroupLog {
        GroupLog {
            id: id.to_string(),
            df: df!("case" => cases.to_vec(), "activity" => vec!["x"; cases.len()]).unwrap(),
        }
    }

    fn some<'a>(cases: &[&'a str]) -> Vec<Option<&'a str>> {
        cases.iter().map(|c| Some(*c)).collect()
    }

    fn summary(a: &GroupLog, b: &GroupLog) -> RelationSummary {
        plan(a, b, "case").unwrap().summary
    }

    fn case_ids(log: &GroupLog) -> Vec<String> {
        let mut ids: Vec<String> = log
            .df
            .column("case")
            .unwrap()
            .str()
            .unwrap()
            .iter()
            .map(|v| v.unwrap_or("null").to_string())
            .collect();
        ids.sort();
        ids.dedup();
        ids
    }

    #[test]
    fn disjoint_groups_lose_nothing() {
        let s = summary(&log("a", &some(&["1", "2"])), &log("b", &some(&["3"])));
        assert_eq!(s.status, Status::Ok);
        assert_eq!(s.relation, Some(Relation::Disjoint));
        assert_eq!(s.removed, HashMap::from([("a".into(), 0), ("b".into(), 0)]));
    }

    #[test]
    fn partial_overlap_removes_the_intersection_from_both() {
        let a = log("a", &some(&["1", "2", "3", "3"]));
        let b = log("b", &some(&["3", "4"]));
        let s = summary(&a, &b);
        assert_eq!(s.relation, Some(Relation::Partial));
        assert_eq!(s.kept, HashMap::from([("a".into(), 2), ("b".into(), 1)]));
        let out = reduce(vec![a, b], "case").unwrap();
        assert_eq!(case_ids(&out[0]), ["1", "2"]);
        assert_eq!(case_ids(&out[1]), ["4"]);
    }

    #[test]
    fn containment_removes_the_inner_cases_from_the_outer_only() {
        let a = log("a", &some(&["1", "2"]));
        let b = log("b", &some(&["1", "2", "3"]));
        let s = summary(&a, &b);
        assert_eq!(s.relation, Some(Relation::Contained));
        assert_eq!(s.inner.as_deref(), Some("a"));
        assert_eq!(s.removed, HashMap::from([("a".into(), 0), ("b".into(), 2)]));
        let out = reduce(vec![a, b], "case").unwrap();
        assert_eq!(case_ids(&out[0]), ["1", "2"]);
        assert_eq!(case_ids(&out[1]), ["3"]);
    }

    #[test]
    fn identical_case_sets_are_refused_even_with_different_events() {
        let a = log("a", &some(&["1", "2"]));
        let b = log("b", &some(&["1", "2", "2", "1"]));
        assert_eq!(summary(&a, &b).status, Status::Identical);
        assert_eq!(reduce(vec![a, b], "case").err().unwrap(), REFUSED);
    }

    #[test]
    fn an_empty_group_is_refused_before_identity() {
        let s = summary(&log("a", &[]), &log("b", &[]));
        assert_eq!(s.status, Status::Empty);
        assert_eq!(
            summary(&log("a", &[]), &log("b", &some(&["1"]))).status,
            Status::Empty
        );
    }

    #[test]
    fn null_case_ids_are_never_shared_and_their_rows_stay() {
        let a = log("a", &[Some("1"), None, Some("2")]);
        let b = log("b", &[Some("2"), None, Some("3")]);
        assert_eq!(summary(&a, &b).relation, Some(Relation::Partial));
        let out = reduce(vec![a, b], "case").unwrap();
        assert_eq!(case_ids(&out[0]), ["1", "null"]);
    }

    #[test]
    fn integer_case_ids_compare_as_strings() {
        let a = GroupLog {
            id: "a".into(),
            df: df!("case" => [1i64, 2, 3]).unwrap(),
        };
        let b = GroupLog {
            id: "b".into(),
            df: df!("case" => [3i64, 4]).unwrap(),
        };
        let out = reduce(vec![a, b], "case").unwrap();
        assert_eq!(out[0].df.height(), 2);
        assert_eq!(out[1].df.height(), 1);
    }

    #[test]
    fn the_summary_serializes_in_camel_case() {
        let s = summary(&log("a", &some(&["1"])), &log("b", &some(&["1", "2"])));
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["status"], "ok");
        assert_eq!(json["relation"], "contained");
        assert_eq!(json["inner"], "a");
        assert_eq!(json["removed"]["b"], 1);
    }
}

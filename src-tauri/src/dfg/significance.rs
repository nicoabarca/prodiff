//! Which method decides each Significance Test at an activity or edge, on one
//! observation per case. A numeric attribute takes Mann-Whitney on each case's
//! mean. Everything else is a two-by-two of cases: chi-square while Cochran's
//! rule holds, Fisher's exact test otherwise. A categorical attribute is one
//! two-by-two per value.

use crate::analysis::{Acc, AttributeBlock, Test};
use statrs::stats_tests::{fishers_exact, Alternative};
use std::collections::{BTreeSet, HashMap};
use std::ops::Deref;

const HELD: (&str, &str) = ("Held", "Not held");

/// How a test's p-value was computed. `Test.test` still reads `chi2` under
/// `Fisher`, the statistic and effect size it carries.
#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Method {
    MannWhitney,
    Chi2,
    Fisher,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaceBlock {
    #[serde(flatten)]
    pub block: AttributeBlock,
    pub method: Option<Method>,
}

impl Deref for PlaceBlock {
    type Target = AttributeBlock;

    fn deref(&self) -> &AttributeBlock {
        &self.block
    }
}

/// Cochran's rule: chi-square's p-value can be trusted when no expected count
/// is below 1 and at most a fifth of them are below 5.
fn cochran_holds(expected: &[f64]) -> bool {
    let small = expected.iter().filter(|e| **e < 5.0).count();
    expected.iter().all(|e| *e >= 1.0) && small * 5 <= expected.len()
}

/// Expected counts of a value by Group table, one row per value.
fn expected(rows: &[[i64; 2]]) -> Vec<f64> {
    let totals = [0, 1].map(|group| rows.iter().map(|row| row[group]).sum::<i64>() as f64);
    let all = totals[0] + totals[1];
    rows.iter()
        .flat_map(|row| {
            let across = (row[0] + row[1]) as f64;
            totals.map(|total| across * total / all)
        })
        .collect()
}

/// Each Group's cases split into `labels`, with a category no case falls in left out.
fn split(
    ids: &[String],
    hits: &HashMap<String, i64>,
    totals: &HashMap<String, i64>,
    labels: (&str, &str),
) -> HashMap<String, Acc> {
    ids.iter()
        .filter_map(|id| {
            let total = totals.get(id).copied().filter(|total| *total > 0)?;
            let hit = hits.get(id).copied().unwrap_or(0);
            let counts = [(labels.0, hit), (labels.1, total - hit)]
                .into_iter()
                .filter(|(_, n)| *n > 0)
                .map(|(label, n)| (label.to_string(), n))
                .collect();
            Some((id.clone(), Acc::Cat(counts)))
        })
        .collect()
}

/// Replaces a two-by-two's p-value with Fisher's when Cochran's rule fails.
/// `None` when Fisher's test cannot run on the table.
fn settle(test: &mut Test, table: [[i64; 2]; 2]) -> Option<Method> {
    if cochran_holds(&expected(&table)) {
        return Some(Method::Chi2);
    }
    let [[a, b], [c, d]] = table;
    let cells = [a as u64, c as u64, b as u64, d as u64];
    test.p_value = fishers_exact(&cells, Alternative::TwoSided).ok()?;
    Some(Method::Fisher)
}

/// A numeric attribute, one value per case.
pub fn numeric(ids: &[String], accs: &HashMap<String, Acc>) -> PlaceBlock {
    let block = super::block(ids, accs, true);
    let method = block.test.as_ref().map(|_| Method::MannWhitney);
    PlaceBlock { block, method }
}

/// How many of each Group's `totals` cases fall under `hits`, with `higher`
/// naming the Group whose share is larger.
pub fn two_by_two(
    ids: &[String],
    hits: &HashMap<String, i64>,
    totals: &HashMap<String, i64>,
    labels: (&str, &str),
) -> PlaceBlock {
    let accs = split(ids, hits, totals, labels);
    let mut block = super::block(ids, &accs, false);
    let [a, b] = ids else {
        return PlaceBlock {
            block,
            method: None,
        };
    };
    let hit = |id: &String| hits.get(id).copied().unwrap_or(0);
    let total = |id: &String| totals.get(id).copied().unwrap_or(0);
    let table = [[hit(a), hit(b)], [total(a) - hit(a), total(b) - hit(b)]];

    let method = block.test.as_mut().and_then(|test| {
        let share = |id: &String| hit(id) as f64 / total(id).max(1) as f64;
        test.higher = match share(a).total_cmp(&share(b)) {
            std::cmp::Ordering::Greater => Some(a.clone()),
            std::cmp::Ordering::Less => Some(b.clone()),
            std::cmp::Ordering::Equal => None,
        };
        settle(test, table)
    });
    if method.is_none() {
        block.test = None;
    }
    PlaceBlock { block, method }
}

/// A categorical attribute, one two-by-two per value: of each Group's `cases`
/// reaching the activity with a value, how many ever held it there. A case
/// holding several values counts under each, and every value is its own test.
pub fn per_value(
    ids: &[String],
    accs: &HashMap<String, Acc>,
    cases: &HashMap<String, i64>,
) -> HashMap<String, PlaceBlock> {
    let counts = |id: &String| match accs.get(id) {
        Some(Acc::Cat(counts)) => Some(counts),
        _ => None,
    };
    let values: BTreeSet<&String> = ids
        .iter()
        .filter_map(counts)
        .flat_map(|c| c.keys())
        .collect();
    values
        .into_iter()
        .map(|value| {
            let hits = ids
                .iter()
                .map(|id| {
                    let held = counts(id).and_then(|c| c.get(value)).copied().unwrap_or(0);
                    (id.clone(), held)
                })
                .collect();
            (value.clone(), two_by_two(ids, &hits, cases, HELD))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::{stats, Summary};

    fn ids() -> Vec<String> {
        vec!["a".to_string(), "b".to_string()]
    }

    fn by_group(a: i64, b: i64) -> HashMap<String, i64> {
        HashMap::from([("a".to_string(), a), ("b".to_string(), b)])
    }

    fn cat(values: &[(&str, i64)]) -> Acc {
        Acc::Cat(values.iter().map(|(v, n)| (v.to_string(), *n)).collect())
    }

    fn accs(a: Acc, b: Acc) -> HashMap<String, Acc> {
        HashMap::from([("a".to_string(), a), ("b".to_string(), b)])
    }

    const LABELS: (&str, &str) = ("Yes", "No");

    #[test]
    fn a_sparse_two_by_two_takes_fishers_p() {
        let rare = two_by_two(&ids(), &by_group(1, 1), &by_group(5, 100), LABELS);
        assert_eq!(rare.method, Some(Method::Fisher));
        assert!((rare.test.as_ref().unwrap().p_value - 0.0934).abs() < 1e-3);

        let large = two_by_two(&ids(), &by_group(1, 8), &by_group(1000, 1000), LABELS);
        assert_eq!(large.method, Some(Method::Fisher));
        assert!((large.test.as_ref().unwrap().p_value - 0.0386).abs() < 1e-3);
    }

    #[test]
    fn a_two_by_two_within_cochrans_rule_stays_chi_square() {
        let block = two_by_two(&ids(), &by_group(100, 60), &by_group(200, 200), LABELS);
        let test = block.test.as_ref().unwrap();
        let table = accs(
            cat(&[("Yes", 100), ("No", 100)]),
            cat(&[("Yes", 60), ("No", 140)]),
        );
        let plain = stats::compare(&ids(), &[&table["a"], &table["b"]], false).unwrap();
        assert_eq!(block.method, Some(Method::Chi2));
        assert_eq!(test.p_value, plain.p_value);
        assert_eq!(test.higher.as_deref(), Some("a"));
    }

    #[test]
    fn a_value_every_case_held_in_one_group_is_detected() {
        // Proportional columns: chi-square over the mentions reads 0.
        let places = per_value(
            &ids(),
            &accs(cat(&[("x", 20), ("y", 20)]), cat(&[("x", 10), ("y", 10)])),
            &by_group(20, 20),
        );
        for value in ["x", "y"] {
            let test = places[value].test.as_ref().unwrap();
            assert!(test.p_value < 0.01);
            assert_eq!(test.higher.as_deref(), Some("a"));
        }
    }

    #[test]
    fn each_value_counts_its_cases_out_of_the_cases_reaching_the_activity() {
        let places = per_value(
            &ids(),
            &accs(
                cat(&[("Ana", 30), ("Bo", 30)]),
                cat(&[("Ana", 10), ("Bo", 30)]),
            ),
            &by_group(40, 40),
        );
        let Summary::Categorical { n, counts } = &places["Ana"].summaries["b"] else {
            panic!("a categorical summary");
        };
        assert_eq!(*n, 40);
        assert_eq!(counts["Held"], 10);
        assert_eq!(counts["Not held"], 30);
        assert!(places["Ana"].test.as_ref().unwrap().p_value < 0.001);
        assert!(places["Bo"].test.as_ref().unwrap().p_value > 0.5);
    }

    #[test]
    fn a_value_one_group_never_held_is_still_tested() {
        let places = per_value(
            &ids(),
            &accs(cat(&[("x", 50), ("y", 10)]), cat(&[("x", 50)])),
            &by_group(50, 50),
        );
        assert!(places["y"].test.as_ref().unwrap().p_value < 0.01);
    }
}

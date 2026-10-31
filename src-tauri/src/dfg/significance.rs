//! Which method decides each Significance Test at an activity or edge, on one
//! observation per case. Chi-square is used only when each case falls in one
//! category and Cochran's rule holds. Otherwise a two-by-two takes its p-value
//! from Fisher's exact test, and a categorical attribute tests each value on
//! its own.

use crate::analysis::{stats, Acc, AttributeBlock, Summary, Test, MIN_GROUP_CASES};
use statrs::stats_tests::{fishers_exact, Alternative};
use std::collections::{BTreeSet, HashMap};
use std::ops::Deref;

const HELD: (&str, &str) = ("Held", "Not held");

/// How a test's p-value was computed. `Test.test` still reads `chi2` under
/// `Fisher` and `PerValue`, the statistic and effect size it carries.
#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Method {
    MannWhitney,
    Chi2,
    Fisher,
    PerValue,
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

/// A categorical attribute, each value counted in the cases that ever held it,
/// out of each Group's `cases` with a value. Counts sum above `cases` when some
/// case held several values.
pub fn categorical(
    ids: &[String],
    accs: &HashMap<String, Acc>,
    cases: &HashMap<String, i64>,
) -> PlaceBlock {
    let counts = |id: &String| match accs.get(id) {
        Some(Acc::Cat(counts)) => Some(counts),
        _ => None,
    };
    let summaries = ids
        .iter()
        .filter_map(|id| {
            Some((
                id.clone(),
                Summary::Categorical {
                    n: *cases.get(id)? as usize,
                    counts: counts(id).filter(|counts| !counts.is_empty())?.clone(),
                },
            ))
        })
        .collect();

    let enough = |id: &String| cases.get(id).copied().unwrap_or(0) >= MIN_GROUP_CASES as i64;
    let decided = match ids {
        [a, b] if enough(a) && enough(b) => match (counts(a), counts(b)) {
            (Some(left), Some(right)) => decide(ids, [a, b], [left, right], cases),
            _ => None,
        },
        _ => None,
    };
    let (test, method) = decided.map_or((None, None), |(test, method)| (Some(test), Some(method)));
    PlaceBlock {
        block: AttributeBlock { summaries, test },
        method,
    }
}

fn decide(
    ids: &[String],
    [a, b]: [&String; 2],
    [left, right]: [&HashMap<String, i64>; 2],
    cases: &HashMap<String, i64>,
) -> Option<(Test, Method)> {
    let values: BTreeSet<&String> = left.keys().chain(right.keys()).collect();
    let single = |counts: &HashMap<String, i64>, id: &String| {
        counts.values().sum::<i64>() <= cases.get(id).copied().unwrap_or(0)
    };
    let rows: Vec<[i64; 2]> = values
        .iter()
        .map(|value| {
            [
                left.get(*value).copied().unwrap_or(0),
                right.get(*value).copied().unwrap_or(0),
            ]
        })
        .collect();

    if single(left, a) && single(right, b) && cochran_holds(&expected(&rows)) {
        let accs = [Acc::Cat(left.clone()), Acc::Cat(right.clone())];
        let test = stats::compare(ids, &[&accs[0], &accs[1]], false)?;
        return Some((test, Method::Chi2));
    }

    let tests: Vec<Test> = rows
        .iter()
        .filter_map(|row| {
            let hits = HashMap::from([(a.clone(), row[0]), (b.clone(), row[1])]);
            let block = two_by_two(ids, &hits, cases, HELD);
            block.block.test
        })
        .collect();
    let tested = tests.len() as f64;
    let mut smallest = tests
        .into_iter()
        .min_by(|x, y| x.p_value.total_cmp(&y.p_value))?;
    smallest.p_value = (smallest.p_value * tested).min(1.0);
    smallest.higher = None;
    Some((smallest, Method::PerValue))
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let block = categorical(
            &ids(),
            &accs(
                cat(&[("x", 20), ("y", 20)]),
                cat(&[("x", 10), ("y", 10)]),
            ),
            &by_group(20, 20),
        );
        let test = block.test.as_ref().unwrap();
        assert_eq!(block.method, Some(Method::PerValue));
        assert!(test.p_value < 0.01);
        assert!(test.higher.is_none());
    }

    #[test]
    fn several_values_count_their_cases_not_their_mentions() {
        let block = categorical(
            &ids(),
            &accs(cat(&[("x", 3), ("y", 3)]), cat(&[("x", 3), ("y", 3)])),
            &by_group(3, 3),
        );
        assert!(block.test.is_none());
        let Summary::Categorical { n, .. } = &block.summaries["a"] else {
            panic!("a categorical summary");
        };
        assert_eq!(*n, 3);
    }

    #[test]
    fn one_value_per_case_within_cochrans_rule_is_the_trees_chi_square() {
        let table = accs(cat(&[("x", 40), ("y", 60)]), cat(&[("x", 60), ("y", 40)]));
        let block = categorical(&ids(), &table, &by_group(100, 100));
        let plain = stats::compare(&ids(), &[&table["a"], &table["b"]], false).unwrap();
        assert_eq!(block.method, Some(Method::Chi2));
        assert_eq!(block.test.as_ref().unwrap().p_value, plain.p_value);
    }

    #[test]
    fn a_rare_value_moves_the_place_to_the_per_value_test() {
        let block = categorical(
            &ids(),
            &accs(
                cat(&[("x", 96), ("y", 3), ("z", 1)]),
                cat(&[("x", 50), ("y", 49), ("z", 1)]),
            ),
            &by_group(100, 100),
        );
        assert_eq!(block.method, Some(Method::PerValue));
    }
}

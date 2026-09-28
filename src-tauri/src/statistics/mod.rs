//! The Statistics view's comparison: case durations, activity figures and the
//! attribute columns of up to two Groups, with a Significance Test wherever two
//! Groups are compared. Payloads are keyed by Group id.

pub mod commands;

use crate::analysis::stats::{self, quantile};
use crate::analysis::{Acc, GroupLog, Summary, Test, ALPHA, MIN_GROUP_CASES};
use crate::column_mapping::{
    find_role, require_role, CaseResolution, ColumnMapping, ColumnRole, ColumnScope, ColumnType,
};
use polars::prelude::*;
use std::collections::HashMap;

/// How many categories of one attribute ship per Group at most, biggest first
/// by pooled count. `Summary::Categorical.n` still counts every value.
const SHIP_VALUES: usize = 20;

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GroupComparison {
    pub groups: Vec<GroupFigures>,
    pub duration_test: Option<Test>,
    pub activities: Vec<ActivityRow>,
    pub attributes: Vec<AttributeRow>,
    pub variants: Vec<VariantRow>,
    pub variant_census: VariantCensus,
    pub has_activity_duration: bool,
}

/// One Variant: the activities its cases follow, and how many cases per Group.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VariantRow {
    pub activities: Vec<String>,
    pub cases: HashMap<String, i64>,
}

/// Every Variant counted. `only` holds, per Group, the Variants no other Group
/// follows.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VariantCensus {
    pub total: usize,
    pub shared: usize,
    pub only: HashMap<String, usize>,
}

/// One Group's case-shaped figures. Durations are milliseconds.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GroupFigures {
    pub id: String,
    pub cases: i64,
    pub duration: Option<Summary>,
    pub duration_p10: Option<f64>,
    pub duration_p90: Option<f64>,
    pub start_activities: HashMap<String, i64>,
    pub end_activities: HashMap<String, i64>,
}

/// One activity across the Groups. `cases` counts the cases touching it at
/// least once; `avg_duration_ms` is its mean completion minus start, present
/// only when a start timestamp is mapped.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRow {
    pub name: String,
    pub cases: HashMap<String, i64>,
    pub events: HashMap<String, i64>,
    pub avg_duration_ms: HashMap<String, f64>,
}

/// One attribute column. A case-scoped one has one value per case, from the row
/// its resolution names; an event-scoped one has one value per event.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AttributeRow {
    pub name: String,
    pub scope: &'static str,
    pub summaries: HashMap<String, Summary>,
    pub test: Option<Test>,
}

struct AttrPlan<'a> {
    name: &'a str,
    numeric: bool,
    resolution: Option<CaseResolution>,
}

/// One Group's valid rows in (case, completion) order, split into cases.
struct Ordered {
    rows: Vec<usize>,
    bounds: Vec<(usize, usize)>,
}

fn strings(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, String> {
    let series = df
        .column(name)
        .map_err(|e| e.to_string())?
        .cast(&DataType::String)
        .map_err(|e| e.to_string())?;
    Ok(series
        .str()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|v| v.map(str::to_string))
        .collect())
}

fn floats(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, String> {
    let series = df
        .column(name)
        .map_err(|e| e.to_string())?
        .cast(&DataType::Float64)
        .map_err(|e| e.to_string())?;
    Ok(series.f64().map_err(|e| e.to_string())?.iter().collect())
}

fn millis(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, String> {
    let series = df
        .column(name)
        .map_err(|e| e.to_string())?
        .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
        .map_err(|e| e.to_string())?;
    Ok(series
        .datetime()
        .map_err(|e| e.to_string())?
        .physical()
        .iter()
        .map(|v| v.map(|ms| ms as f64))
        .collect())
}

fn order(
    cases: &[Option<String>],
    activities: &[Option<String>],
    complete: &[Option<f64>],
) -> Ordered {
    let mut rows: Vec<usize> = (0..cases.len())
        .filter(|&r| cases[r].is_some() && activities[r].is_some() && complete[r].is_some())
        .collect();
    rows.sort_by(|&a, &b| {
        cases[a].cmp(&cases[b]).then_with(|| {
            complete[a]
                .partial_cmp(&complete[b])
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    let mut bounds = Vec::new();
    let mut from = 0;
    while from < rows.len() {
        let mut to = from + 1;
        while to < rows.len() && cases[rows[to]] == cases[rows[from]] {
            to += 1;
        }
        bounds.push((from, to));
        from = to;
    }
    Ordered { rows, bounds }
}

/// What one Group contributes before the Groups are set side by side.
struct GroupPass {
    figures: GroupFigures,
    durations: Vec<f64>,
    activities: HashMap<String, (i64, i64, f64, i64)>,
    variants: HashMap<Vec<String>, i64>,
    attributes: Vec<Acc>,
}

fn pass(
    log: &GroupLog,
    mapping: &[ColumnMapping],
    plans: &[AttrPlan],
) -> Result<GroupPass, String> {
    let df = &log.df;
    let cases = strings(df, require_role(mapping, ColumnRole::CaseId)?)?;
    let activities = strings(df, require_role(mapping, ColumnRole::ActivityName)?)?;
    let complete = millis(df, require_role(mapping, ColumnRole::CompleteTimestamp)?)?;
    let start = match find_role(mapping, ColumnRole::StartTimestamp) {
        Some(name) => Some(millis(df, name)?),
        None => None,
    };
    let Ordered { rows, bounds } = order(&cases, &activities, &complete);

    let mut durations = Vec::with_capacity(bounds.len());
    let mut starts: HashMap<String, i64> = HashMap::new();
    let mut ends: HashMap<String, i64> = HashMap::new();
    // Per activity: cases touching it, events, summed activity duration, timed events.
    let mut per_activity: HashMap<String, (i64, i64, f64, i64)> = HashMap::new();
    let mut variants: HashMap<Vec<String>, i64> = HashMap::new();

    for &(from, to) in &bounds {
        let first = rows[from];
        let last = rows[to - 1];
        let times = rows[from..to].iter().filter_map(|&r| complete[r]);
        let (low, high) = times.fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), t| {
            (lo.min(t), hi.max(t))
        });
        durations.push(high - low);
        *starts
            .entry(activities[first].clone().unwrap_or_default())
            .or_default() += 1;
        *ends
            .entry(activities[last].clone().unwrap_or_default())
            .or_default() += 1;

        let trace: Vec<String> = rows[from..to]
            .iter()
            .map(|&r| activities[r].clone().unwrap_or_default())
            .collect();
        *variants.entry(trace).or_default() += 1;

        let mut seen: Vec<&str> = Vec::new();
        for &r in &rows[from..to] {
            let name = activities[r].as_deref().unwrap_or_default();
            let entry = per_activity.entry(name.to_string()).or_default();
            entry.1 += 1;
            if !seen.contains(&name) {
                seen.push(name);
                entry.0 += 1;
            }
            if let Some(start) = &start {
                if let (Some(s), Some(c)) = (start[r], complete[r]) {
                    entry.2 += c - s;
                    entry.3 += 1;
                }
            }
        }
    }

    let attributes = plans
        .iter()
        .map(|plan| attribute_values(df, plan, &rows, &bounds))
        .collect::<Result<Vec<_>, String>>()?;

    let mut sorted = durations.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let duration = (!sorted.is_empty()).then(|| stats::numeric_summary(&sorted));

    Ok(GroupPass {
        figures: GroupFigures {
            id: log.id.clone(),
            cases: bounds.len() as i64,
            duration,
            duration_p10: (!sorted.is_empty()).then(|| quantile(&sorted, 0.1)),
            duration_p90: (!sorted.is_empty()).then(|| quantile(&sorted, 0.9)),
            start_activities: starts,
            end_activities: ends,
        },
        durations,
        activities: per_activity,
        variants,
        attributes,
    })
}

fn attribute_values(
    df: &DataFrame,
    plan: &AttrPlan,
    rows: &[usize],
    bounds: &[(usize, usize)],
) -> Result<Acc, String> {
    let picked: Vec<usize> = match plan.resolution {
        Some(CaseResolution::Last) => bounds.iter().map(|&(_, to)| rows[to - 1]).collect(),
        Some(_) => bounds.iter().map(|&(from, _)| rows[from]).collect(),
        None => rows.to_vec(),
    };
    let mut acc = Acc::new(plan.numeric);
    match &mut acc {
        Acc::Num(out) => {
            let values = floats(df, plan.name)?;
            out.extend(picked.iter().filter_map(|&r| values[r]));
        }
        Acc::Cat(out) => {
            let values = strings(df, plan.name)?;
            for &r in &picked {
                if let Some(value) = &values[r] {
                    *out.entry(value.clone()).or_default() += 1;
                }
            }
        }
    }
    Ok(acc)
}

/// Keeps the `SHIP_VALUES` biggest categories by pooled count in every Group's
/// counts, so the payload stays small whatever the cardinality.
fn cut_categories(summaries: &mut HashMap<String, Summary>) {
    let mut pooled: HashMap<String, i64> = HashMap::new();
    for summary in summaries.values() {
        if let Summary::Categorical { counts, .. } = summary {
            for (value, count) in counts {
                *pooled.entry(value.clone()).or_default() += count;
            }
        }
    }
    if pooled.len() <= SHIP_VALUES {
        return;
    }
    let mut ranked: Vec<(String, i64)> = pooled.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let kept: std::collections::HashSet<String> = ranked
        .into_iter()
        .take(SHIP_VALUES)
        .map(|(v, _)| v)
        .collect();
    for summary in summaries.values_mut() {
        if let Summary::Categorical { counts, .. } = summary {
            counts.retain(|value, _| kept.contains(value));
        }
    }
}

fn variant_rows(passes: &[GroupPass]) -> (Vec<VariantRow>, VariantCensus) {
    let mut merged: HashMap<&Vec<String>, HashMap<String, i64>> = HashMap::new();
    for p in passes {
        for (trace, count) in &p.variants {
            merged
                .entry(trace)
                .or_default()
                .insert(p.figures.id.clone(), *count);
        }
    }
    let mut only: HashMap<String, usize> =
        passes.iter().map(|p| (p.figures.id.clone(), 0)).collect();
    let mut shared = 0;
    for cases in merged.values() {
        if cases.len() == passes.len() {
            shared += 1;
        } else if let Some(id) = cases.keys().next().filter(|_| cases.len() == 1) {
            *only.entry(id.clone()).or_default() += 1;
        }
    }
    let census = VariantCensus {
        total: merged.len(),
        shared,
        only,
    };
    let mut rows: Vec<VariantRow> = merged
        .into_iter()
        .map(|(trace, cases)| VariantRow {
            activities: trace.clone(),
            cases,
        })
        .collect();
    let total = |row: &VariantRow| row.cases.values().sum::<i64>();
    rows.sort_by(|a, b| {
        total(b)
            .cmp(&total(a))
            .then_with(|| a.activities.cmp(&b.activities))
    });
    (rows, census)
}

fn is_temporal(column_type: &ColumnType) -> bool {
    matches!(
        column_type,
        ColumnType::Date { .. } | ColumnType::Datetime { .. }
    )
}

/// Compares the Groups given, in order. With one Group no test runs.
/// `attributes` names the columns to compare; temporal and unknown ones are
/// dropped.
pub fn compare(
    logs: &[GroupLog],
    mapping: &[ColumnMapping],
    attributes: &[String],
) -> Result<GroupComparison, String> {
    let plans: Vec<AttrPlan> = attributes
        .iter()
        .filter_map(|name| {
            let column = mapping.iter().find(|c| &c.name == name)?;
            if column.role != ColumnRole::Other || is_temporal(&column.column_type) {
                return None;
            }
            Some(AttrPlan {
                name,
                numeric: column.column_type.is_numeric(),
                resolution: match column.scope {
                    ColumnScope::Case { resolution } => Some(resolution),
                    ColumnScope::Event => None,
                },
            })
        })
        .collect();

    let passes = logs
        .iter()
        .map(|log| pass(log, mapping, &plans))
        .collect::<Result<Vec<_>, String>>()?;
    let ids: Vec<String> = logs.iter().map(|log| log.id.clone()).collect();
    let pair = passes.len() == 2;

    let duration_test = if pair && passes.iter().all(|p| p.durations.len() >= MIN_GROUP_CASES) {
        let a = Acc::Num(passes[0].durations.clone());
        let b = Acc::Num(passes[1].durations.clone());
        stats::compare(&ids, &[&a, &b], true).map(|test| Test {
            significant: test.p_value <= ALPHA,
            ..test
        })
    } else {
        None
    };

    let mut names: Vec<String> = passes
        .iter()
        .flat_map(|p| p.activities.keys().cloned())
        .collect();
    names.sort();
    names.dedup();
    let activities = names
        .into_iter()
        .map(|name| {
            let mut row = ActivityRow {
                name: name.clone(),
                cases: HashMap::new(),
                events: HashMap::new(),
                avg_duration_ms: HashMap::new(),
            };
            for p in &passes {
                let (cases, events, total, timed) =
                    p.activities.get(&name).copied().unwrap_or_default();
                row.cases.insert(p.figures.id.clone(), cases);
                row.events.insert(p.figures.id.clone(), events);
                if timed > 0 {
                    row.avg_duration_ms
                        .insert(p.figures.id.clone(), total / timed as f64);
                }
            }
            row
        })
        .collect();

    let mut tests: Vec<Option<Test>> = plans
        .iter()
        .enumerate()
        .map(|(i, plan)| {
            if !pair {
                return None;
            }
            let (a, b) = (&passes[0].attributes[i], &passes[1].attributes[i]);
            if a.len() < MIN_GROUP_CASES || b.len() < MIN_GROUP_CASES {
                return None;
            }
            stats::compare(&ids, &[a, b], plan.numeric)
        })
        .collect();
    // The attribute columns are one family.
    let cutoff = stats::benjamini_hochberg(
        &tests
            .iter()
            .flatten()
            .map(|t| t.p_value)
            .collect::<Vec<_>>(),
        ALPHA,
    );
    for test in tests.iter_mut().flatten() {
        test.significant = test.p_value <= cutoff;
    }

    let attributes = plans
        .iter()
        .zip(tests)
        .enumerate()
        .map(|(i, (plan, test))| {
            let mut summaries: HashMap<String, Summary> = passes
                .iter()
                .filter_map(|p| Some((p.figures.id.clone(), p.attributes[i].summary()?)))
                .collect();
            cut_categories(&mut summaries);
            AttributeRow {
                name: plan.name.to_string(),
                scope: if plan.resolution.is_some() {
                    "case"
                } else {
                    "event"
                },
                summaries,
                test,
            }
        })
        .collect();

    let (variants, variant_census) = variant_rows(&passes);

    Ok(GroupComparison {
        variants,
        variant_census,
        groups: passes.into_iter().map(|p| p.figures).collect(),
        duration_test,
        activities,
        attributes,
        has_activity_duration: find_role(mapping, ColumnRole::StartTimestamp).is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"event"},
              {"name":"act","role":"activity_name","type":"string","scope":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"},
              {"name":"cost","role":"other","type":"integer","scope":"event"},
              {"name":"brand","role":"other","type":"string","scope":"case","caseResolution":"last"}
            ]"#,
        )
        .unwrap()
    }

    fn log(id: &str, rows: &[(&str, &str, i64, i64, &str)]) -> GroupLog {
        let ts = Column::new("ts".into(), rows.iter().map(|r| r.2).collect::<Vec<_>>())
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap();
        GroupLog {
            id: id.to_string(),
            df: DataFrame::new(
                rows.len(),
                vec![
                    Column::new("case".into(), rows.iter().map(|r| r.0).collect::<Vec<_>>()),
                    Column::new("act".into(), rows.iter().map(|r| r.1).collect::<Vec<_>>()),
                    ts,
                    Column::new("cost".into(), rows.iter().map(|r| r.3).collect::<Vec<_>>()),
                    Column::new("brand".into(), rows.iter().map(|r| r.4).collect::<Vec<_>>()),
                ],
            )
            .unwrap(),
        }
    }

    /// Cases of two events each, A at 0 and B at `span` plus the case's index.
    fn spans(cases: &[String], span: i64) -> Vec<(&str, &'static str, i64, i64, &'static str)> {
        cases
            .iter()
            .enumerate()
            .flat_map(|(i, id)| {
                [
                    (id.as_str(), "A", 0, 1, "x"),
                    (id.as_str(), "B", span + i as i64, 1, "x"),
                ]
            })
            .collect()
    }

    fn attrs() -> Vec<String> {
        vec!["cost".into(), "brand".into(), "ts".into()]
    }

    #[test]
    fn figures_one_group() {
        // Rows out of order: case 1 is A (t=0) then B (t=5000), and ends on brand y.
        let original = log(
            "original",
            &[
                ("1", "B", 5_000, 2, "y"),
                ("1", "A", 0, 1, "x"),
                ("2", "A", 0, 3, "x"),
                ("2", "A", 1_000, 4, "x"),
            ],
        );
        let result = compare(&[original], &mapping(), &attrs()).unwrap();
        let group = &result.groups[0];
        assert_eq!(group.cases, 2);
        assert_eq!(group.start_activities.get("A"), Some(&2));
        assert_eq!(group.end_activities.get("B"), Some(&1));
        assert_eq!(result.variant_census.total, 2);
        assert_eq!(result.variants[0].cases["original"], 1);
        let Some(Summary::Numerical { max, min, .. }) = &group.duration else {
            panic!("expected a numeric duration");
        };
        assert_eq!((*min, *max), (1_000.0, 5_000.0));

        let a = result.activities.iter().find(|r| r.name == "A").unwrap();
        assert_eq!(a.cases["original"], 2);
        assert_eq!(a.events["original"], 3);
        assert!(a.avg_duration_ms.is_empty());

        // The timestamp column is not an attribute, and nothing is tested alone.
        assert_eq!(result.attributes.len(), 2);
        assert!(result.duration_test.is_none());
        let brand = result
            .attributes
            .iter()
            .find(|r| r.name == "brand")
            .unwrap();
        assert_eq!(brand.scope, "case");
        let Summary::Categorical { counts, .. } = &brand.summaries["original"] else {
            panic!("expected categorical");
        };
        assert_eq!(counts.get("y"), Some(&1));
        assert_eq!(counts.get("x"), Some(&1));
    }

    #[test]
    fn tests_two_groups() {
        let ids: Vec<String> = (0..16).map(|i| format!("c{i}")).collect();
        let result = compare(
            &[
                log("a", &spans(&ids[..8], 1_000)),
                log("b", &spans(&ids[8..], 100_000)),
            ],
            &mapping(),
            &attrs(),
        )
        .unwrap();
        let test = result
            .duration_test
            .expect("two Groups of eight cases are tested");
        assert!(test.significant);
        assert_eq!(test.higher.as_deref(), Some("b"));
        assert_eq!(result.groups.len(), 2);
        // Every case is A then B: one Variant, followed by both Groups.
        assert_eq!(result.variant_census.shared, 1);
        assert_eq!(result.variant_census.only["a"], 0);
    }
}

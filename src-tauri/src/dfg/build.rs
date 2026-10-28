//! DFG aggregation.

use super::{Counts, RequestedAttribute};
use crate::analysis::{transition_time_expr, Acc, GroupLog, VARIANT_KEY_SEP};
use crate::column_mapping::{
    find_role, require_role, CaseResolution, ColumnMapping, ColumnRole, ColumnScope, ColumnType,
};
use polars::prelude::*;
use std::collections::{HashMap, HashSet};

const GROUP: &str = "__dfg_group";
const CASE: &str = "__dfg_case";
const ACT: &str = "__dfg_activity";
const COMPLETE: &str = "__dfg_complete";
const ARRIVAL: &str = "__dfg_arrival";
const DURATION: &str = "__dfg_duration";
const PREVIOUS: &str = "__dfg_previous";
const PREVIOUS_COMPLETE: &str = "__dfg_previous_complete";
const DELTA: &str = "__dfg_delta";
const EVENTS: &str = "__dfg_events";
const CASES: &str = "__dfg_cases";
const VALUE: &str = "__dfg_value";
const SEQUENCE: &str = "__dfg_sequence";
const GROUPS_PER_CASE: &str = "__dfg_groups_per_case";
const OCCURRENCES: &str = "__dfg_occurrences";

pub(super) struct EventAttr {
    pub name: String,
    pub numeric: bool,
    column: String,
}

/// A case-scoped attribute: one value per case, read from the row its
/// resolution names. Never measured per activity.
pub(super) struct CaseAttr {
    pub name: String,
    pub numeric: bool,
    resolution: CaseResolution,
    column: String,
}

/// One case-scoped attribute's values, keyed by Group id.
pub(super) struct CaseLevelAgg {
    pub name: String,
    pub numeric: bool,
    pub accs: HashMap<String, Acc>,
}

#[derive(Default)]
pub(super) struct NodeAgg {
    pub counts: HashMap<String, Counts>,
    pub attributes: HashMap<String, HashMap<String, Acc>>,
    pub occurrences: HashMap<String, Acc>,
}

pub(super) struct VariantAgg {
    pub activities: Vec<String>,
    pub cases: HashMap<String, i64>,
}

pub(super) type Transitions = HashMap<(String, String), HashMap<String, Acc>>;

pub(super) struct Aggregates {
    pub nodes: HashMap<String, NodeAgg>,
    pub variants: Vec<VariantAgg>,
    pub transitions: Transitions,
    pub case_counts: HashMap<String, i64>,
    pub overlap_cases: i64,
    pub attributes: Vec<EventAttr>,
    pub case_level: Vec<CaseLevelAgg>,
}

pub(super) fn plan(
    requested: &[RequestedAttribute],
    mapping: &[ColumnMapping],
    has_start: bool,
) -> Result<(Vec<EventAttr>, bool, Vec<CaseAttr>), String> {
    let mut attributes = Vec::new();
    let mut wants_transition = false;
    let mut case_level = Vec::new();
    let mut names = HashSet::new();

    for request in requested {
        let name = request.name();
        if !names.insert(name) {
            return Err(format!("Attribute {name:?} was requested more than once."));
        }
        match request {
            RequestedAttribute::TransitionTime => wants_transition = true,
            RequestedAttribute::ActivityDuration if has_start => attributes.push(EventAttr {
                name: name.to_string(),
                numeric: true,
                column: DURATION.to_string(),
            }),
            RequestedAttribute::ActivityDuration => {}
            RequestedAttribute::ActivityFrequency
            | RequestedAttribute::EdgeFrequency
            | RequestedAttribute::Repetitions => {}
            RequestedAttribute::Column { name } => {
                let Some(column) = mapping.iter().find(|column| &column.name == name) else {
                    continue;
                };
                let numeric = matches!(column.column_type, ColumnType::Integer | ColumnType::Float);
                if let ColumnScope::Case { resolution } = column.scope {
                    case_level.push(CaseAttr {
                        name: name.clone(),
                        numeric,
                        resolution,
                        column: format!("__dfg_case_attr_{}", case_level.len()),
                    });
                    continue;
                }
                attributes.push(EventAttr {
                    name: name.clone(),
                    numeric,
                    column: format!("__dfg_attr_{}", attributes.len()),
                });
            }
        }
    }
    Ok((attributes, wants_transition, case_level))
}

fn combined(
    logs: &[GroupLog],
    mapping: &[ColumnMapping],
    attributes: &[EventAttr],
    case_attributes: &[CaseAttr],
) -> Result<LazyFrame, String> {
    let case_col = require_role(mapping, ColumnRole::CaseId)?;
    let activity_col = require_role(mapping, ColumnRole::ActivityName)?;
    let complete_col = require_role(mapping, ColumnRole::CompleteTimestamp)?;
    let start_col = find_role(mapping, ColumnRole::StartTimestamp);

    let millis = |name: &str| {
        col(name)
            .cast(DataType::Datetime(TimeUnit::Milliseconds, None))
            .cast(DataType::Int64)
    };

    let mut projection = vec![
        col(case_col).cast(DataType::String).alias(CASE),
        col(activity_col)
            .cast(DataType::String)
            .fill_null(lit(""))
            .alias(ACT),
        millis(complete_col).alias(COMPLETE),
    ];
    match start_col {
        Some(start) => {
            projection.push(millis(start).alias(ARRIVAL));
            projection.push(
                (millis(complete_col) - millis(start))
                    .cast(DataType::Float64)
                    .alias(DURATION),
            );
        }
        None => projection.push(millis(complete_col).alias(ARRIVAL)),
    }
    for attr in attributes {
        if attr.column == DURATION {
            continue;
        }
        let value = if attr.numeric {
            col(&attr.name).cast(DataType::Float64)
        } else {
            col(&attr.name).cast(DataType::String)
        };
        projection.push(value.alias(&attr.column));
    }
    for attr in case_attributes {
        let value = if attr.numeric {
            col(&attr.name).cast(DataType::Float64)
        } else {
            col(&attr.name).cast(DataType::String)
        };
        projection.push(value.alias(&attr.column));
    }

    let frames = logs
        .iter()
        .map(|log| {
            log.df
                .clone()
                .lazy()
                .select(projection.clone())
                .with_column(lit(log.id.clone()).alias(GROUP))
        })
        .collect::<Vec<_>>();

    concat(frames, UnionArgs::default()).map_err(|e| e.to_string())
}

pub(super) fn aggregate(
    logs: &[GroupLog],
    mapping: &[ColumnMapping],
    requested: &[RequestedAttribute],
    selection: Option<&[String]>,
) -> Result<Aggregates, String> {
    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let (attributes, wants_transition, case_attributes) = plan(requested, mapping, has_start)?;

    let window = || [col(GROUP), col(CASE)];
    let prepared = combined(logs, mapping, &attributes, &case_attributes)?
        .with_columns([
            col(ACT)
                .shift(lit(1))
                .over(window())
                .map_err(|e| e.to_string())?
                .alias(PREVIOUS),
            col(COMPLETE)
                .shift(lit(1))
                .over(window())
                .map_err(|e| e.to_string())?
                .alias(PREVIOUS_COMPLETE),
        ])
        .with_column(
            transition_time_expr(col(ARRIVAL), col(PREVIOUS_COMPLETE))
                .cast(DataType::Float64)
                .alias(DELTA),
        )
        .collect()
        .map_err(|e| e.to_string())?;
    let lf = prepared.lazy();
    // Cut before anything is accumulated, so every Node Aggregate and
    // Significance Test downstream describes exactly the Variants included.
    let lf = match selection {
        Some(keys) => filter_by_variants(lf, keys)?,
        None => lf,
    };

    let mut nodes: HashMap<String, NodeAgg> = HashMap::new();
    node_counts(&lf, &attributes, &mut nodes)?;
    for attr in attributes.iter().filter(|a| !a.numeric) {
        categorical(&lf, attr, &mut nodes)?;
    }

    Ok(Aggregates {
        nodes,
        variants: variants(&lf)?,
        transitions: if wants_transition {
            transitions(&lf)?
        } else {
            HashMap::new()
        },
        case_counts: case_counts(&lf)?,
        overlap_cases: overlap(&lf)?,
        attributes,
        case_level: case_level(&lf, &case_attributes)?,
    })
}

/// Event and case counts per activity, how many times each case that reaches
/// it runs it, and each numeric attribute as one value per case: the mean of
/// that case's events at the activity, so a case that repeats an activity is
/// one observation.
fn node_counts(
    lf: &LazyFrame,
    attributes: &[EventAttr],
    nodes: &mut HashMap<String, NodeAgg>,
) -> Result<(), String> {
    let numeric = || attributes.iter().filter(|a| a.numeric);

    let mut per_case = vec![len().cast(DataType::Int64).alias(EVENTS)];
    per_case.extend(numeric().map(|attr| col(&attr.column).mean().alias(&attr.column)));

    let mut per_activity = vec![
        col(EVENTS).sum().cast(DataType::Int64).alias(EVENTS),
        len().cast(DataType::Int64).alias(CASES),
        col(EVENTS).cast(DataType::Float64).alias(OCCURRENCES),
    ];
    per_activity.extend(numeric().map(|attr| col(&attr.column).drop_nulls().alias(&attr.column)));

    let df = lf
        .clone()
        .group_by([col(GROUP), col(ACT), col(CASE)])
        .agg(per_case)
        .group_by([col(GROUP), col(ACT)])
        .agg(per_activity)
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let labels = strings(&df, ACT)?;
    let events = ints(&df, EVENTS)?;
    let cases = ints(&df, CASES)?;

    for attr in numeric() {
        for (row, values) in float_lists(&df, &attr.column)?.into_iter().enumerate() {
            nodes
                .entry(labels[row].clone())
                .or_default()
                .attributes
                .entry(attr.name.clone())
                .or_default()
                .insert(groups[row].clone(), Acc::Num(values));
        }
    }
    for (row, values) in float_lists(&df, OCCURRENCES)?.into_iter().enumerate() {
        nodes
            .entry(labels[row].clone())
            .or_default()
            .occurrences
            .insert(groups[row].clone(), Acc::Num(values));
    }
    for row in 0..df.height() {
        nodes.entry(labels[row].clone()).or_default().counts.insert(
            groups[row].clone(),
            Counts {
                cases: cases[row],
                events: events[row],
            },
        );
    }
    Ok(())
}

/// Each value of a categorical attribute counted in cases that ever had it at
/// the activity. A case whose repeats carry different values counts once under
/// each of them.
fn categorical(
    lf: &LazyFrame,
    attr: &EventAttr,
    nodes: &mut HashMap<String, NodeAgg>,
) -> Result<(), String> {
    let df = lf
        .clone()
        .filter(col(&attr.column).is_not_null())
        .group_by([col(GROUP), col(ACT), col(&attr.column).alias(VALUE)])
        .agg([col(CASE).n_unique().cast(DataType::Int64).alias(CASES)])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let labels = strings(&df, ACT)?;
    let values = strings(&df, VALUE)?;
    let cases = ints(&df, CASES)?;

    for row in 0..df.height() {
        let acc = nodes
            .entry(labels[row].clone())
            .or_default()
            .attributes
            .entry(attr.name.clone())
            .or_default()
            .entry(groups[row].clone())
            .or_insert_with(|| Acc::new(false));
        if let Acc::Cat(counts) = acc {
            *counts.entry(values[row].clone()).or_insert(0) += cases[row];
        }
    }
    Ok(())
}

/// Keeps only the cases whose activity sequence joins into one of `keys`, the
/// same key format `tree::variant_key` and `list_variants` use. Filters
/// per-Group rather than by `CASE` alone: a case id can appear in both Groups
/// with a different trace under each one's own filters.
fn filter_by_variants(lf: LazyFrame, keys: &[String]) -> Result<LazyFrame, String> {
    let wanted: HashSet<&str> = keys.iter().map(String::as_str).collect();

    let df = lf
        .clone()
        .group_by([col(GROUP), col(CASE)])
        .agg([col(ACT).alias(SEQUENCE)])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let cases = strings(&df, CASE)?;
    let sequences = string_lists(&df, SEQUENCE)?;

    let mut allowed: HashMap<String, Vec<String>> = HashMap::new();
    for row in 0..groups.len() {
        let key = sequences[row].join(VARIANT_KEY_SEP);
        if wanted.contains(key.as_str()) {
            allowed
                .entry(groups[row].clone())
                .or_default()
                .push(cases[row].clone());
        }
    }

    let predicate = allowed.into_iter().fold(lit(false), |acc, (group, cases)| {
        let ids = Series::new("__dfg_case".into(), cases);
        acc.or(col(GROUP)
            .eq(lit(group))
            .and(col(CASE).is_in(lit(ids).implode(true), false)))
    });

    Ok(lf.filter(predicate))
}

/// Each case-scoped attribute, one value per case and Group, from the case's
/// first or last row as its resolution says. Rows run in timestamp order within
/// a case, so `First` is its earliest event and `Last` its latest. Read after
/// the Variant cut, so it describes the same cases the graph draws.
fn case_level(lf: &LazyFrame, attrs: &[CaseAttr]) -> Result<Vec<CaseLevelAgg>, String> {
    if attrs.is_empty() {
        return Ok(Vec::new());
    }
    let picks = attrs
        .iter()
        .map(|attr| {
            let value = match attr.resolution {
                CaseResolution::Constant | CaseResolution::First => col(&attr.column).first(),
                CaseResolution::Last => col(&attr.column).last(),
            };
            value.alias(&attr.column)
        })
        .collect::<Vec<_>>();
    let df = lf
        .clone()
        .group_by([col(GROUP), col(CASE)])
        .agg(picks)
        .collect()
        .map_err(|e| e.to_string())?;
    let groups = strings(&df, GROUP)?;

    attrs
        .iter()
        .map(|attr| {
            let column = df.column(&attr.column).map_err(|e| e.to_string())?;
            let mut accs: HashMap<String, Acc> = HashMap::new();
            if attr.numeric {
                let values = column.f64().map_err(|e| e.to_string())?;
                for (row, value) in values.iter().enumerate() {
                    let Some(value) = value else { continue };
                    if let Acc::Num(out) = accs
                        .entry(groups[row].clone())
                        .or_insert_with(|| Acc::new(true))
                    {
                        out.push(value);
                    }
                }
            } else {
                let values = column.str().map_err(|e| e.to_string())?;
                for (row, value) in values.iter().enumerate() {
                    let Some(value) = value else { continue };
                    if let Acc::Cat(out) = accs
                        .entry(groups[row].clone())
                        .or_insert_with(|| Acc::new(false))
                    {
                        *out.entry(value.to_string()).or_insert(0) += 1;
                    }
                }
            }
            Ok(CaseLevelAgg {
                name: attr.name.clone(),
                numeric: attr.numeric,
                accs,
            })
        })
        .collect()
}

fn variants(lf: &LazyFrame) -> Result<Vec<VariantAgg>, String> {
    let df = lf
        .clone()
        .group_by([col(GROUP), col(CASE)])
        .agg([col(ACT).alias(SEQUENCE)])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let sequences = string_lists(&df, SEQUENCE)?;

    let mut folded: HashMap<Vec<String>, HashMap<String, i64>> = HashMap::new();
    for (row, activities) in sequences.into_iter().enumerate() {
        *folded
            .entry(activities)
            .or_default()
            .entry(groups[row].clone())
            .or_insert(0) += 1;
    }

    let mut variants: Vec<VariantAgg> = folded
        .into_iter()
        .map(|(activities, cases)| VariantAgg { activities, cases })
        .collect();
    variants.sort_by(|a, b| a.activities.cmp(&b.activities));
    Ok(variants)
}

/// Each pair's wait as one value per case: the mean of the case's waits on it.
fn transitions(lf: &LazyFrame) -> Result<Transitions, String> {
    let df = lf
        .clone()
        .filter(col(PREVIOUS).is_not_null())
        .group_by([col(GROUP), col(PREVIOUS), col(ACT), col(CASE)])
        .agg([col(DELTA).mean().alias(DELTA)])
        .group_by([col(GROUP), col(PREVIOUS), col(ACT)])
        .agg([col(DELTA).drop_nulls().alias(DELTA)])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let sources = strings(&df, PREVIOUS)?;
    let targets = strings(&df, ACT)?;
    let deltas = float_lists(&df, DELTA)?;

    let mut transitions: Transitions = HashMap::new();
    for (row, delta) in deltas.into_iter().enumerate() {
        transitions
            .entry((sources[row].clone(), targets[row].clone()))
            .or_default()
            .insert(groups[row].clone(), Acc::Num(delta));
    }
    Ok(transitions)
}

fn case_counts(lf: &LazyFrame) -> Result<HashMap<String, i64>, String> {
    let df = lf
        .clone()
        .group_by([col(GROUP)])
        .agg([col(CASE).n_unique().cast(DataType::Int64).alias(CASES)])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let cases = ints(&df, CASES)?;
    Ok(groups.into_iter().zip(cases).collect())
}

fn overlap(lf: &LazyFrame) -> Result<i64, String> {
    let df = lf
        .clone()
        .group_by([col(CASE)])
        .agg([col(GROUP)
            .n_unique()
            .cast(DataType::Int64)
            .alias(GROUPS_PER_CASE)])
        .filter(col(GROUPS_PER_CASE).gt(lit(1i64)))
        .select([len().cast(DataType::Int64).alias(CASES)])
        .collect()
        .map_err(|e| e.to_string())?;

    Ok(ints(&df, CASES)?.first().copied().unwrap_or(0))
}

fn strings(df: &DataFrame, name: &str) -> Result<Vec<String>, String> {
    Ok(df
        .column(name)
        .map_err(|e| e.to_string())?
        .str()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|v| v.unwrap_or_default().to_string())
        .collect())
}

fn ints(df: &DataFrame, name: &str) -> Result<Vec<i64>, String> {
    Ok(df
        .column(name)
        .map_err(|e| e.to_string())?
        .i64()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|v| v.unwrap_or_default())
        .collect())
}

fn string_lists(df: &DataFrame, name: &str) -> Result<Vec<Vec<String>>, String> {
    let column = df.column(name).map_err(|e| e.to_string())?;
    let lists = column.list().map_err(|e| e.to_string())?;
    (0..lists.len())
        .map(|row| {
            let Some(series) = lists.get_as_series(row) else {
                return Ok(Vec::new());
            };
            Ok(series
                .str()
                .map_err(|e| e.to_string())?
                .iter()
                .map(|value| value.unwrap_or_default().to_string())
                .collect())
        })
        .collect()
}

fn float_lists(df: &DataFrame, name: &str) -> Result<Vec<Vec<f64>>, String> {
    let column = df.column(name).map_err(|e| e.to_string())?;
    let lists = column.list().map_err(|e| e.to_string())?;
    (0..lists.len())
        .map(|row| {
            let Some(series) = lists.get_as_series(row) else {
                return Ok(Vec::new());
            };
            let values = series.cast(&DataType::Float64).map_err(|e| e.to_string())?;
            Ok(values
                .f64()
                .map_err(|e| e.to_string())?
                .iter()
                .flatten()
                .collect())
        })
        .collect()
}

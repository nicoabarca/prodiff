//! DFG aggregation.

use super::{Counts, RequestedAttribute};
use crate::analysis::{Acc, GroupLog, VARIANT_KEY_SEP};
use crate::column_mapping::{
    find_role, require_role, ColumnMapping, ColumnRole, ColumnScope, ColumnType,
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

pub(super) struct EventAttr {
    pub name: String,
    pub numeric: bool,
    column: String,
}

#[derive(Default)]
pub(super) struct NodeAgg {
    pub counts: HashMap<String, Counts>,
    pub attributes: HashMap<String, HashMap<String, Acc>>,
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
    pub skipped_case_level: Vec<String>,
}

pub(super) fn plan(
    requested: &[RequestedAttribute],
    mapping: &[ColumnMapping],
    has_start: bool,
) -> Result<(Vec<EventAttr>, bool, Vec<String>), String> {
    let mut attributes = Vec::new();
    let mut wants_transition = false;
    let mut skipped = Vec::new();
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
            RequestedAttribute::Column { name } => {
                let Some(column) = mapping.iter().find(|column| &column.name == name) else {
                    continue;
                };
                if matches!(column.scope, ColumnScope::Case { .. }) {
                    skipped.push(name.clone());
                    continue;
                }
                attributes.push(EventAttr {
                    name: name.clone(),
                    numeric: matches!(column.column_type, ColumnType::Integer | ColumnType::Float),
                    column: format!("__dfg_attr_{}", attributes.len()),
                });
            }
        }
    }
    Ok((attributes, wants_transition, skipped))
}

fn combined(
    logs: &[GroupLog],
    mapping: &[ColumnMapping],
    attributes: &[EventAttr],
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
    let (attributes, wants_transition, skipped_case_level) = plan(requested, mapping, has_start)?;

    let window = || [col(GROUP), col(CASE)];
    let prepared = combined(logs, mapping, &attributes)?
        .sort([GROUP, CASE, COMPLETE, ARRIVAL], SortMultipleOptions::default())
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
            (col(ARRIVAL) - col(PREVIOUS_COMPLETE))
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
        skipped_case_level,
    })
}

fn node_counts(
    lf: &LazyFrame,
    attributes: &[EventAttr],
    nodes: &mut HashMap<String, NodeAgg>,
) -> Result<(), String> {
    let mut aggs = vec![
        len().cast(DataType::Int64).alias(EVENTS),
        col(CASE).n_unique().cast(DataType::Int64).alias(CASES),
    ];
    for attr in attributes.iter().filter(|a| a.numeric) {
        aggs.push(col(&attr.column).drop_nulls().alias(&attr.column));
    }

    let df = lf
        .clone()
        .group_by([col(GROUP), col(ACT)])
        .agg(aggs)
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let labels = strings(&df, ACT)?;
    let events = ints(&df, EVENTS)?;
    let cases = ints(&df, CASES)?;

    for attr in attributes.iter().filter(|a| a.numeric) {
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

fn categorical(
    lf: &LazyFrame,
    attr: &EventAttr,
    nodes: &mut HashMap<String, NodeAgg>,
) -> Result<(), String> {
    let df = lf
        .clone()
        .filter(col(&attr.column).is_not_null())
        .group_by([col(GROUP), col(ACT), col(&attr.column).alias(VALUE)])
        .agg([len().cast(DataType::Int64).alias(EVENTS)])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let labels = strings(&df, ACT)?;
    let values = strings(&df, VALUE)?;
    let events = ints(&df, EVENTS)?;

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
            *counts.entry(values[row].clone()).or_insert(0) += events[row];
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

fn transitions(lf: &LazyFrame) -> Result<Transitions, String> {
    let df = lf
        .clone()
        .filter(col(PREVIOUS).is_not_null())
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

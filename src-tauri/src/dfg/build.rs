//! Aggregates the DFG payload from Group logs.

use super::Counts;
use crate::analysis::{Acc, GroupLog, ACTIVITY_DURATION, TRANSITION_TIME};
use crate::column_mapping::{
    find_role, require_role, ColumnMapping, ColumnRole, ColumnScope, ColumnType,
};
use polars::prelude::*;
use std::collections::HashMap;

/// Columns this pass adds. Prefixed so a log's own headers can't collide.
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

/// One event-level attribute as the pass reads it: the name it answers to and
/// the projected column its values arrive in.
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

/// One trace shape: the activities in the order they occurred, and how many
/// cases of each Group ran it. Every count the graph draws is folded from
/// these, so hiding an activity re-links through it with figures the log
/// actually holds.
pub(super) struct VariantAgg {
    pub activities: Vec<String>,
    pub cases: HashMap<String, i64>,
}

/// Waits in milliseconds by (source, target) then Group id.
pub(super) type Transitions = HashMap<(String, String), HashMap<String, Acc>>;

pub(super) struct Aggregates {
    pub nodes: HashMap<String, NodeAgg>,
    pub variants: Vec<VariantAgg>,
    pub transitions: Transitions,
    pub overlap_cases: i64,
    pub attributes: Vec<EventAttr>,
    pub skipped_case_level: Vec<String>,
}

/// Splits the requested names into the event-level attributes a node can carry,
/// the case-level ones it cannot, and whether the edges were asked for their
/// waiting time. Names the mapping does not know are dropped.
fn plan(
    requested: &[String],
    mapping: &[ColumnMapping],
    has_start: bool,
) -> (Vec<EventAttr>, bool, Vec<String>) {
    let mut attributes = Vec::new();
    let mut wants_transition = false;
    let mut skipped = Vec::new();

    for name in requested {
        if name == TRANSITION_TIME {
            wants_transition = true;
            continue;
        }
        if name == ACTIVITY_DURATION {
            if has_start {
                attributes.push(EventAttr {
                    name: name.clone(),
                    numeric: true,
                    column: DURATION.to_string(),
                });
            }
            continue;
        }
        let Some(column) = mapping.iter().find(|c| &c.name == name) else {
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
    (attributes, wants_transition, skipped)
}

/// The Groups stacked into one frame, projected down to what the pass reads and
/// carrying the Group id as a column.
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
        // With a start timestamp the wait ends when the next activity begins;
        // without one it ends when the next activity completes, which absorbs
        // that activity's own duration.
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
    requested: &[String],
) -> Result<Aggregates, String> {
    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let (attributes, wants_transition, skipped_case_level) = plan(requested, mapping, has_start);

    let window = || [col(GROUP), col(CASE)];
    let lf = combined(logs, mapping, &attributes)?
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
        );

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
        overlap_cases: overlap(&lf)?,
        attributes,
        skipped_case_level,
    })
}

/// Per (Group, activity): the two counts, plus the raw values of every numeric
/// attribute. Categorical ones are counted separately, which keeps a text
/// column from travelling one string per event.
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

/// One categorical attribute, counted in the query rather than shipped as
/// values: the Significance Test only ever sees the contingency table.
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

/// One row per case, its activities in trace order, folded into the distinct
/// shapes and counted per Group.
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
    // Ordered so the same log always ships the same payload: the widest shapes
    // first, then alphabetically.
    variants.sort_by(|a, b| {
        let total = |v: &VariantAgg| -> i64 { v.cases.values().sum() };
        total(b)
            .cmp(&total(a))
            .then_with(|| a.activities.cmp(&b.activities))
    });
    Ok(variants)
}

/// The wait each directly-follows pair spans, in milliseconds. A null previous
/// activity marks the first event of its case, which has no pair to contribute.
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

/// Cases living in more than one Group. Non-zero means the samples are not
/// independent and every Significance Test below it is optimistic.
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

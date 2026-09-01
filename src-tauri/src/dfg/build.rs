//! One vectorized pass over the concatenation of the Groups. Everything the
//! payload measures comes out of here; nothing is pruned, scored or laid out.
//!
//! Rows are persisted sorted by (case, timestamp) and filtering preserves
//! order, so a window partitioned by (group, case) sees each case in trace
//! order without a sort.

use super::Counts;
use crate::analysis::{Acc, GroupLog, ACTIVITY_DURATION, TRANSITION_TIME};
use crate::column_mapping::{
    find_role, require_role, ColumnGranularity, ColumnMapping, ColumnRole, ColumnType,
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
const NEXT: &str = "__dfg_next";
const PREVIOUS_COMPLETE: &str = "__dfg_previous_complete";
const DELTA: &str = "__dfg_delta";
const EVENTS: &str = "__dfg_events";
const CASES: &str = "__dfg_cases";
const VALUE: &str = "__dfg_value";
const WAIT_TOTAL: &str = "__dfg_wait_total";
const WAIT_N: &str = "__dfg_wait_n";
const GROUPS_PER_CASE: &str = "__dfg_groups_per_case";

/// One event-level attribute as the pass reads it: the name it answers to and
/// the projected column its values arrive in.
pub(super) struct EventAttr {
    pub name: String,
    pub numeric: bool,
    column: String,
}

/// Where an edge starts or ends. Start and End are the two synthetic nodes.
#[derive(PartialEq, Eq, Hash, Clone, Debug)]
pub(super) enum Endpoint {
    Start,
    End,
    Activity(String),
}

#[derive(Default)]
pub(super) struct NodeAgg {
    pub counts: HashMap<String, Counts>,
    /// Attribute name, then Group id.
    pub attributes: HashMap<String, HashMap<String, Acc>>,
}

#[derive(Default)]
pub(super) struct EdgeAgg {
    pub counts: HashMap<String, Counts>,
    /// Waiting times in milliseconds, by Group id. Filled only when the view
    /// asked for them, and never on a Start or End edge.
    pub transition: HashMap<String, Acc>,
    /// The same waits over every Group at once, kept whether or not the view
    /// asked: the correlation the frontend simplifies by is computed from them.
    pub wait_total: f64,
    pub wait_n: i64,
}

pub(super) struct Aggregates {
    pub nodes: HashMap<String, NodeAgg>,
    pub edges: HashMap<(Endpoint, Endpoint), EdgeAgg>,
    pub case_counts: HashMap<String, i64>,
    pub overlap_cases: i64,
    pub attributes: Vec<EventAttr>,
    pub wants_transition: bool,
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
        if column.granularity == ColumnGranularity::Case {
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
            col(ACT)
                .shift(lit(-1))
                .over(window())
                .map_err(|e| e.to_string())?
                .alias(NEXT),
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
    let mut edges: HashMap<(Endpoint, Endpoint), EdgeAgg> = HashMap::new();

    node_counts(&lf, &attributes, &mut nodes)?;
    for attr in attributes.iter().filter(|a| !a.numeric) {
        categorical(&lf, attr, &mut nodes)?;
    }
    inner_edges(&lf, wants_transition, &mut edges)?;
    boundary_edges(&lf, &mut edges)?;

    Ok(Aggregates {
        nodes,
        edges,
        case_counts: case_counts(&lf)?,
        overlap_cases: overlap(&lf)?,
        attributes,
        wants_transition,
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

/// Every directly-follows pair inside a case. A null previous activity marks
/// the first event of its case, which has no pair to contribute.
fn inner_edges(
    lf: &LazyFrame,
    wants_transition: bool,
    edges: &mut HashMap<(Endpoint, Endpoint), EdgeAgg>,
) -> Result<(), String> {
    let df = lf
        .clone()
        .filter(col(PREVIOUS).is_not_null())
        .group_by([col(GROUP), col(PREVIOUS), col(ACT)])
        .agg([
            len().cast(DataType::Int64).alias(EVENTS),
            col(CASE).n_unique().cast(DataType::Int64).alias(CASES),
            col(DELTA).sum().cast(DataType::Float64).alias(WAIT_TOTAL),
            col(DELTA).count().cast(DataType::Int64).alias(WAIT_N),
            col(DELTA).drop_nulls().alias(DELTA),
        ])
        .collect()
        .map_err(|e| e.to_string())?;

    let groups = strings(&df, GROUP)?;
    let sources = strings(&df, PREVIOUS)?;
    let targets = strings(&df, ACT)?;
    let events = ints(&df, EVENTS)?;
    let cases = ints(&df, CASES)?;
    let wait_total = floats(&df, WAIT_TOTAL)?;
    let wait_n = ints(&df, WAIT_N)?;
    let deltas = float_lists(&df, DELTA)?;

    for (row, delta) in deltas.into_iter().enumerate() {
        let key = (
            Endpoint::Activity(sources[row].clone()),
            Endpoint::Activity(targets[row].clone()),
        );
        let edge = edges.entry(key).or_default();
        edge.counts.insert(
            groups[row].clone(),
            Counts {
                cases: cases[row],
                events: events[row],
            },
        );
        edge.wait_total += wait_total[row];
        edge.wait_n += wait_n[row];
        if wants_transition {
            edge.transition.insert(groups[row].clone(), Acc::Num(delta));
        }
    }
    Ok(())
}

/// The Start and End edges. A case's first event has no previous activity and
/// its last has no next one, which is what marks the two boundaries. They span
/// no wait, so they carry no transition time.
fn boundary_edges(
    lf: &LazyFrame,
    edges: &mut HashMap<(Endpoint, Endpoint), EdgeAgg>,
) -> Result<(), String> {
    for (boundary, marker) in [(Endpoint::Start, PREVIOUS), (Endpoint::End, NEXT)] {
        let df = lf
            .clone()
            .filter(col(marker).is_null())
            .group_by([col(GROUP), col(ACT)])
            .agg([
                len().cast(DataType::Int64).alias(EVENTS),
                col(CASE).n_unique().cast(DataType::Int64).alias(CASES),
            ])
            .collect()
            .map_err(|e| e.to_string())?;

        let groups = strings(&df, GROUP)?;
        let labels = strings(&df, ACT)?;
        let events = ints(&df, EVENTS)?;
        let cases = ints(&df, CASES)?;

        for row in 0..df.height() {
            let activity = Endpoint::Activity(labels[row].clone());
            let key = match boundary {
                Endpoint::Start => (Endpoint::Start, activity),
                _ => (activity, Endpoint::End),
            };
            edges.entry(key).or_default().counts.insert(
                groups[row].clone(),
                Counts {
                    cases: cases[row],
                    events: events[row],
                },
            );
        }
    }
    Ok(())
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

fn floats(df: &DataFrame, name: &str) -> Result<Vec<f64>, String> {
    Ok(df
        .column(name)
        .map_err(|e| e.to_string())?
        .f64()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|v| v.unwrap_or_default())
        .collect())
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

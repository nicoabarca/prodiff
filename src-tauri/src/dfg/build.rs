//! DFG aggregation.

use super::{give_up_if, Counts, RequestedAttribute, Superseded};
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
    pub attribute_cases: HashMap<String, HashMap<String, i64>>,
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
    superseded: Superseded,
) -> Result<Aggregates, String> {
    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let (attributes, wants_transition, case_attributes) = plan(requested, mapping, has_start)?;

    let events = combined(logs, mapping, &attributes, &case_attributes)?
        .collect()
        .map_err(|e| e.to_string())?;
    give_up_if(superseded)?;
    let cases = Cases::read(&events, &case_attributes, selection)?;
    give_up_if(superseded)?;
    // Cut before anything is accumulated, so every Node Aggregate and
    // Significance Test downstream describes exactly the Variants included.
    let events = if cases.kept.iter().all(|kept| *kept) {
        events
    } else {
        cases.cut(events)?
    };
    let kept_cases = cases.kept.iter().filter(|kept| **kept).count();
    let lf = with_previous(events, kept_cases)?.lazy();
    give_up_if(superseded)?;

    let mut nodes: HashMap<String, NodeAgg> = HashMap::new();
    node_counts(&lf, &attributes, &mut nodes)?;
    for attr in attributes.iter().filter(|a| !a.numeric) {
        give_up_if(superseded)?;
        categorical(&lf, attr, &mut nodes)?;
    }
    give_up_if(superseded)?;
    let transitions = if wants_transition {
        transitions(&lf)?
    } else {
        HashMap::new()
    };

    Ok(Aggregates {
        nodes,
        variants: cases.variants(),
        transitions,
        case_counts: cases.case_counts(),
        attributes,
        case_level: cases.case_level(&case_attributes)?,
    })
}

/// Each event's previous activity and completion within its case, and the
/// Transition Time since then. Rows run in timestamp order within a case. When
/// every case's rows are also contiguous, which a count of case starts equal to
/// `cases` confirms, the row above is the previous event; otherwise a window
/// over each case finds it.
fn with_previous(events: DataFrame, cases: usize) -> Result<DataFrame, String> {
    let changed = |name: &str| col(name).neq_missing(col(name).shift(lit(1)));
    let starts = events
        .clone()
        .lazy()
        .select([changed(GROUP)
            .or(changed(CASE))
            .cast(DataType::Int64)
            .sum()
            .alias(CASES)])
        .collect()
        .map_err(|e| e.to_string())?;
    let contiguous = ints(&starts, CASES)?.first().copied().unwrap_or(0) as usize == cases;

    let previous = |name: &str| -> Result<Expr, String> {
        if contiguous {
            Ok(when(changed(GROUP).or(changed(CASE)))
                .then(lit(NULL))
                .otherwise(col(name).shift(lit(1))))
        } else {
            col(name)
                .shift(lit(1))
                .over([col(GROUP), col(CASE)])
                .map_err(|e| e.to_string())
        }
    };
    events
        .lazy()
        .with_columns([
            previous(ACT)?.cast(DataType::String).alias(PREVIOUS),
            previous(COMPLETE)?
                .cast(DataType::Int64)
                .alias(PREVIOUS_COMPLETE),
        ])
        .with_column(
            transition_time_expr(col(ARRIVAL), col(PREVIOUS_COMPLETE))
                .cast(DataType::Float64)
                .alias(DELTA),
        )
        .collect()
        .map_err(|e| e.to_string())
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
/// the activity, and how many cases had any value there. A case whose repeats
/// carry different values counts once under each of them, so the value counts
/// can sum above that.
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

    let df = lf
        .clone()
        .filter(col(&attr.column).is_not_null())
        .group_by([col(GROUP), col(ACT)])
        .agg([col(CASE).n_unique().cast(DataType::Int64).alias(CASES)])
        .collect()
        .map_err(|e| e.to_string())?;
    let groups = strings(&df, GROUP)?;
    let labels = strings(&df, ACT)?;
    let cases = ints(&df, CASES)?;
    for row in 0..df.height() {
        nodes
            .entry(labels[row].clone())
            .or_default()
            .attribute_cases
            .entry(attr.name.clone())
            .or_default()
            .insert(groups[row].clone(), cases[row]);
    }
    Ok(())
}

/// Every case of every Group with its activity sequence, read once, and which
/// of them the Variant selection keeps. A case id can appear in both Groups
/// with a different trace under each one's own filters, so a case is a Group
/// and a case id together. `keys` join a sequence the way `tree::variant_key`
/// and `list_variants` do.
struct Cases {
    frame: DataFrame,
    groups: Vec<String>,
    ids: Vec<String>,
    sequences: Vec<Vec<String>>,
    keys: Vec<String>,
    kept: Vec<bool>,
}

impl Cases {
    /// Case-scoped attributes are picked here too, from the case's first or
    /// last non-empty value as its resolution says. Rows run in timestamp order
    /// within a case, so `First` is its earliest event with a value and `Last`
    /// its latest.
    fn read(
        events: &DataFrame,
        case_attributes: &[CaseAttr],
        selection: Option<&[String]>,
    ) -> Result<Self, String> {
        let mut aggs = vec![col(ACT).alias(SEQUENCE)];
        aggs.extend(case_attributes.iter().map(|attr| {
            let value = match attr.resolution {
                CaseResolution::Constant | CaseResolution::First => {
                    col(&attr.column).first_non_null()
                }
                CaseResolution::Last => col(&attr.column).last_non_null(),
            };
            value.alias(&attr.column)
        }));
        let frame = events
            .clone()
            .lazy()
            .group_by([col(GROUP), col(CASE)])
            .agg(aggs)
            .collect()
            .map_err(|e| e.to_string())?;

        let sequences = string_lists(&frame, SEQUENCE)?;
        let keys: Vec<String> = sequences
            .iter()
            .map(|sequence| sequence.join(VARIANT_KEY_SEP))
            .collect();
        let kept = match selection {
            Some(selection) => {
                let wanted: HashSet<&str> = selection.iter().map(String::as_str).collect();
                keys.iter()
                    .map(|key| wanted.contains(key.as_str()))
                    .collect()
            }
            None => vec![true; keys.len()],
        };
        Ok(Self {
            groups: strings(&frame, GROUP)?,
            ids: strings(&frame, CASE)?,
            frame,
            sequences,
            keys,
            kept,
        })
    }

    fn kept_rows(&self) -> impl Iterator<Item = usize> + '_ {
        (0..self.kept.len()).filter(|row| self.kept[*row])
    }

    /// The events of the cases the selection keeps.
    fn cut(&self, events: DataFrame) -> Result<DataFrame, String> {
        let mut allowed: HashMap<&str, Vec<&str>> = HashMap::new();
        for row in self.kept_rows() {
            allowed
                .entry(self.groups[row].as_str())
                .or_default()
                .push(self.ids[row].as_str());
        }
        let predicate = allowed.into_iter().fold(lit(false), |acc, (group, cases)| {
            let ids = Series::new("__dfg_case".into(), cases);
            acc.or(col(GROUP)
                .eq(lit(group))
                .and(col(CASE).is_in(lit(ids).implode(true), false)))
        });
        events
            .lazy()
            .filter(predicate)
            .collect()
            .map_err(|e| e.to_string())
    }

    fn variants(&self) -> Vec<VariantAgg> {
        let mut folded: HashMap<&str, (usize, HashMap<String, i64>)> = HashMap::new();
        for row in self.kept_rows() {
            *folded
                .entry(self.keys[row].as_str())
                .or_insert_with(|| (row, HashMap::new()))
                .1
                .entry(self.groups[row].clone())
                .or_insert(0) += 1;
        }
        let mut variants: Vec<VariantAgg> = folded
            .into_values()
            .map(|(row, cases)| VariantAgg {
                activities: self.sequences[row].clone(),
                cases,
            })
            .collect();
        variants.sort_by(|a, b| a.activities.cmp(&b.activities));
        variants
    }

    fn case_counts(&self) -> HashMap<String, i64> {
        let mut counts: HashMap<String, i64> = HashMap::new();
        for row in self.kept_rows() {
            *counts.entry(self.groups[row].clone()).or_insert(0) += 1;
        }
        counts
    }

    /// Each case-scoped attribute, one value per kept case, keyed by Group id.
    fn case_level(&self, attrs: &[CaseAttr]) -> Result<Vec<CaseLevelAgg>, String> {
        attrs
            .iter()
            .map(|attr| {
                let column = self.frame.column(&attr.column).map_err(|e| e.to_string())?;
                let mut accs: HashMap<String, Acc> = HashMap::new();
                if attr.numeric {
                    let values = column.f64().map_err(|e| e.to_string())?;
                    for (row, value) in values.iter().enumerate() {
                        let Some(value) = value.filter(|_| self.kept[row]) else {
                            continue;
                        };
                        if let Acc::Num(out) = accs
                            .entry(self.groups[row].clone())
                            .or_insert_with(|| Acc::new(true))
                        {
                            out.push(value);
                        }
                    }
                } else {
                    let values = column.str().map_err(|e| e.to_string())?;
                    for (row, value) in values.iter().enumerate() {
                        let Some(value) = value.filter(|_| self.kept[row]) else {
                            continue;
                        };
                        if let Acc::Cat(out) = accs
                            .entry(self.groups[row].clone())
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

//! Directly-Follows Graph payload generation.

mod build;
pub mod commands;

use crate::analysis::{
    stats, Acc, AttributeBlock, GroupLog, ACTIVITY_DURATION, ALPHA, MIN_GROUP_CASES,
    TRANSITION_TIME,
};
use crate::column_mapping::{find_role, ColumnMapping, ColumnRole};
use std::collections::{HashMap, HashSet};

const START_ID: usize = 0;
const END_ID: usize = 1;
const FIRST_ACTIVITY_ID: usize = 2;

/// Derived attributes only the DFG offers, measured from the graph itself
/// rather than from a column. A column of the same name wins over them.
pub const ACTIVITY_FREQUENCY: &str = "Activity Frequency";
pub const EDGE_FREQUENCY: &str = "Edge Frequency";
pub const REPETITIONS: &str = "Repetitions";

/// The two categories a frequency splits each Group's cases into.
const REACHED: (&str, &str) = ("Reached", "Not reached");
const FOLLOWED: (&str, &str) = ("Followed", "Not followed");

#[derive(serde::Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RequestedAttribute {
    Column { name: String },
    ActivityDuration,
    TransitionTime,
    ActivityFrequency,
    EdgeFrequency,
    Repetitions,
}

impl RequestedAttribute {
    fn name(&self) -> &str {
        match self {
            Self::Column { name } => name,
            Self::ActivityDuration => ACTIVITY_DURATION,
            Self::TransitionTime => TRANSITION_TIME,
            Self::ActivityFrequency => ACTIVITY_FREQUENCY,
            Self::EdgeFrequency => EDGE_FREQUENCY,
            Self::Repetitions => REPETITIONS,
        }
    }
}

/// Which of the graph's own measures were asked for.
#[derive(Clone, Copy)]
struct Measured {
    activity_frequency: bool,
    edge_frequency: bool,
    repetitions: bool,
}

impl Measured {
    fn from(requested: &[RequestedAttribute]) -> Self {
        let asked = |wanted: RequestedAttribute| requested.contains(&wanted);
        Self {
            activity_frequency: asked(RequestedAttribute::ActivityFrequency),
            edge_frequency: asked(RequestedAttribute::EdgeFrequency),
            repetitions: asked(RequestedAttribute::Repetitions),
        }
    }
}

#[derive(serde::Serialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub cases: i64,
    pub events: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DfgNode {
    pub id: usize,
    pub label: String,
    pub counts: HashMap<String, Counts>,
    pub attributes: HashMap<String, AttributeBlock>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub activities: Vec<usize>,
    pub cases: HashMap<String, i64>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    pub source: usize,
    pub target: usize,
    pub attributes: HashMap<String, AttributeBlock>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GroupBlock {
    pub id: String,
    pub case_count: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Dfg {
    pub nodes: Vec<DfgNode>,
    pub variants: Vec<Variant>,
    pub transitions: Vec<Transition>,
    pub groups: Vec<GroupBlock>,
    pub comparing: bool,
    pub overlap_cases: i64,
    pub transition_time_basis: &'static str,
    pub has_activity_duration: bool,
    pub case_level: HashMap<String, AttributeBlock>,
}

pub fn build(
    logs: &[GroupLog],
    mapping: &[ColumnMapping],
    attributes: &[RequestedAttribute],
    selection: Option<&[String]>,
) -> Result<Dfg, String> {
    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let ids: Vec<String> = logs.iter().map(|log| log.id.clone()).collect();
    let aggregates = build::aggregate(logs, mapping, attributes, selection)?;

    let mut labels: Vec<&String> = aggregates.nodes.keys().collect();
    labels.sort();
    let node_id: HashMap<&str, usize> = labels
        .iter()
        .enumerate()
        .map(|(i, label)| (label.as_str(), i + FIRST_ACTIVITY_ID))
        .collect();

    let measured = Measured::from(attributes);
    let mut nodes = activity_nodes(&ids, &labels, &node_id, &aggregates, measured);
    correct(nodes.iter_mut().map(|node| &mut node.attributes));
    let mut transitions = transitions(&ids, &node_id, &aggregates, measured);
    correct(
        transitions
            .iter_mut()
            .map(|transition| &mut transition.attributes),
    );
    let mut case_level: HashMap<String, AttributeBlock> = aggregates
        .case_level
        .iter()
        .map(|attr| (attr.name.clone(), block(&ids, &attr.accs, attr.numeric)))
        .collect();
    // Case-level attributes are their own family: one test each, no nodes.
    correct_blocks(case_level.values_mut());

    Ok(Dfg {
        nodes,
        variants: variants(&node_id, &aggregates)?,
        transitions,
        groups: ids
            .iter()
            .map(|id| GroupBlock {
                id: id.clone(),
                case_count: aggregates.case_counts.get(id).copied().unwrap_or(0),
            })
            .collect(),
        comparing: ids.len() > 1,
        overlap_cases: aggregates.overlap_cases,
        transition_time_basis: if has_start {
            "startComplete"
        } else {
            "completeOnly"
        },
        has_activity_duration: has_start,
        case_level,
    })
}

fn activity_nodes(
    ids: &[String],
    labels: &[&String],
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
    measured: Measured,
) -> Vec<DfgNode> {
    labels
        .iter()
        .map(|label| {
            let node = &aggregates.nodes[*label];
            let mut attributes: HashMap<String, AttributeBlock> = aggregates
                .attributes
                .iter()
                .filter_map(|attr| {
                    let accs = node.attributes.get(&attr.name)?;
                    Some((attr.name.clone(), block(ids, accs, attr.numeric)))
                })
                .collect();
            if measured.activity_frequency {
                let reached = node
                    .counts
                    .iter()
                    .map(|(id, counts)| (id.clone(), counts.cases))
                    .collect();
                attributes
                    .entry(ACTIVITY_FREQUENCY.to_string())
                    .or_insert_with(|| frequency(ids, &reached, &aggregates.case_counts, REACHED));
            }
            if measured.repetitions && repeats(&node.occurrences) {
                attributes
                    .entry(REPETITIONS.to_string())
                    .or_insert_with(|| block(ids, &node.occurrences, true));
            }
            DfgNode {
                id: node_id[label.as_str()],
                label: (*label).clone(),
                counts: node.counts.clone(),
                attributes,
            }
        })
        .collect()
}

fn variants(
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
) -> Result<Vec<Variant>, String> {
    aggregates
        .variants
        .iter()
        .map(|variant| {
            let activities = variant
                .activities
                .iter()
                .map(|label| {
                    node_id.get(label.as_str()).copied().ok_or_else(|| {
                        format!("A variant names an activity no node was built for: {label}")
                    })
                })
                .collect::<Result<Vec<usize>, String>>()?;
            Ok(Variant {
                activities,
                cases: variant.cases.clone(),
            })
        })
        .collect()
}

/// What is measured per pair, each when asked for: how often each Group
/// follows it, over every pair the drawn Variants hold with Start and End
/// included, and the wait on it, over the pairs between two activities.
fn transitions(
    ids: &[String],
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
    measured: Measured,
) -> Vec<Transition> {
    let mut followed: HashMap<(usize, usize), HashMap<String, i64>> = HashMap::new();
    let variants = if measured.edge_frequency {
        aggregates.variants.as_slice()
    } else {
        &[]
    };
    for variant in variants {
        let Some(path) = std::iter::once(Some(START_ID))
            .chain(
                variant
                    .activities
                    .iter()
                    .map(|label| node_id.get(label.as_str()).copied()),
            )
            .chain(std::iter::once(Some(END_ID)))
            .collect::<Option<Vec<usize>>>()
        else {
            continue;
        };
        let pairs: HashSet<(usize, usize)> = path.windows(2).map(|w| (w[0], w[1])).collect();
        for pair in pairs {
            let counts = followed.entry(pair).or_default();
            for (id, cases) in &variant.cases {
                *counts.entry(id.clone()).or_insert(0) += cases;
            }
        }
    }

    let mut pairs: HashMap<(usize, usize), HashMap<String, AttributeBlock>> = HashMap::new();
    for ((source, target), accs) in &aggregates.transitions {
        let (Some(source), Some(target)) = (
            node_id.get(source.as_str()).copied(),
            node_id.get(target.as_str()).copied(),
        ) else {
            continue;
        };
        pairs
            .entry((source, target))
            .or_default()
            .insert(TRANSITION_TIME.to_string(), block(ids, accs, true));
    }
    for (pair, counts) in followed {
        pairs.entry(pair).or_default().insert(
            EDGE_FREQUENCY.to_string(),
            frequency(ids, &counts, &aggregates.case_counts, FOLLOWED),
        );
    }

    let mut transitions: Vec<Transition> = pairs
        .into_iter()
        .map(|((source, target), attributes)| Transition {
            source,
            target,
            attributes,
        })
        .collect();
    transitions.sort_by_key(|transition| (transition.source, transition.target));
    transitions
}

/// How many of each Group's cases reach a place, split into `labels` and
/// tested as a two-by-two chi-square, with `higher` naming the Group whose
/// share is larger. A category no case falls in is left out, so a place every
/// case of both Groups reaches has one category and no test, and a place some
/// Group never reaches is not tested either.
fn frequency(
    ids: &[String],
    reached: &HashMap<String, i64>,
    totals: &HashMap<String, i64>,
    labels: (&str, &str),
) -> AttributeBlock {
    let share = |id: &String| {
        let total = totals.get(id).copied().unwrap_or(0).max(1) as f64;
        reached.get(id).copied().unwrap_or(0) as f64 / total
    };
    let accs: HashMap<String, Acc> = ids
        .iter()
        .filter_map(|id| {
            let total = totals.get(id).copied().filter(|total| *total > 0)?;
            let hit = reached.get(id).copied().unwrap_or(0);
            let counts = [(labels.0, hit), (labels.1, total - hit)]
                .into_iter()
                .filter(|(_, n)| *n > 0)
                .map(|(label, n)| (label.to_string(), n))
                .collect();
            Some((id.clone(), Acc::Cat(counts)))
        })
        .collect();

    let mut block = block(ids, &accs, false);
    // A place one Group never reaches is that Group's absence, not a share to compare.
    if ids
        .iter()
        .any(|id| reached.get(id).copied().unwrap_or(0) == 0)
    {
        block.test = None;
    }
    if let (Some(test), [a, b]) = (block.test.as_mut(), ids) {
        test.higher = match share(a).total_cmp(&share(b)) {
            std::cmp::Ordering::Greater => Some(a.clone()),
            std::cmp::Ordering::Less => Some(b.clone()),
            std::cmp::Ordering::Equal => None,
        };
    }
    block
}

/// Whether any case runs the activity more than once.
fn repeats(occurrences: &HashMap<String, Acc>) -> bool {
    occurrences.values().any(|acc| match acc {
        Acc::Num(values) => values.iter().any(|v| *v > 1.0),
        Acc::Cat(_) => false,
    })
}

fn block(ids: &[String], accs: &HashMap<String, Acc>, numeric: bool) -> AttributeBlock {
    let summaries = ids
        .iter()
        .filter_map(|id| Some((id.clone(), accs.get(id)?.summary()?)))
        .collect();

    let test = match ids {
        [a, b] => match (accs.get(a), accs.get(b)) {
            (Some(a), Some(b)) if a.len() >= MIN_GROUP_CASES && b.len() >= MIN_GROUP_CASES => {
                stats::compare(ids, &[a, b], numeric)
            }
            _ => None,
        },
        _ => None,
    };

    AttributeBlock { summaries, test }
}

/// One Benjamini-Hochberg family per attribute name, across every place that
/// measured it.
fn correct<'a>(places: impl Iterator<Item = &'a mut HashMap<String, AttributeBlock>>) {
    let mut families: HashMap<String, Vec<&'a mut AttributeBlock>> = HashMap::new();
    for attributes in places {
        for (name, block) in attributes.iter_mut() {
            families.entry(name.clone()).or_default().push(block);
        }
    }
    for family in families.into_values() {
        correct_blocks(family.into_iter());
    }
}

fn correct_blocks<'a>(blocks: impl Iterator<Item = &'a mut AttributeBlock>) {
    let mut blocks: Vec<&mut AttributeBlock> = blocks.collect();
    let family: Vec<f64> = blocks
        .iter()
        .filter_map(|block| block.test.as_ref().map(|test| test.p_value))
        .collect();
    let cutoff = stats::benjamini_hochberg(&family, ALPHA);
    for block in &mut blocks {
        if let Some(test) = block.test.as_mut() {
            test.significant = test.p_value <= cutoff;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::{Summary, ACTIVITY_DURATION, TRANSITION_TIME};
    use crate::column_mapping::ColumnMapping as Mapping;
    use crate::time::datetime_column;
    use polars::prelude::*;

    fn mapping(with_start: bool) -> Vec<Mapping> {
        let mut columns: Vec<Mapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"act","role":"activity_name","type":"string","scope":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"},
              {"name":"cost","role":"other","type":"integer","scope":"event"},
              {"name":"who","role":"other","type":"string","scope":"event"},
              {"name":"region","role":"other","type":"string","scope":"case","caseResolution":"constant"}
            ]"#,
        )
        .unwrap();
        if with_start {
            columns.push(
                serde_json::from_str(
                    r#"{"name":"start","role":"start_timestamp","type":"datetime","scope":"event"}"#,
                )
                .unwrap(),
            );
        }
        columns
    }

    type Trace<'a> = (&'a str, &'a [(&'a str, i64, i64)]);

    fn log(traces: &[Trace]) -> DataFrame {
        let mut cases = Vec::new();
        let mut acts = Vec::new();
        let mut complete = Vec::new();
        let mut start = Vec::new();
        let mut costs = Vec::new();
        let mut who = Vec::new();
        let mut region = Vec::new();
        for (case, events) in traces {
            for (activity, second, cost) in events.iter() {
                cases.push(case.to_string());
                acts.push(activity.to_string());
                complete.push(second * 1_000);
                start.push(second * 1_000 - 500);
                costs.push(*cost);
                who.push(if *cost > 50 { "Ana" } else { "Bo" });
                region.push(if case.len() > 1 { "north" } else { "south" });
            }
        }
        let height = cases.len();
        DataFrame::new(
            height,
            vec![
                Column::new("case".into(), cases),
                Column::new("act".into(), acts),
                datetime_column("ts", complete),
                datetime_column("start", start),
                Column::new("cost".into(), costs),
                Column::new("who".into(), who),
                Column::new("region".into(), region),
            ],
        )
        .unwrap()
    }

    fn logs(a: &DataFrame, b: Option<&DataFrame>) -> Vec<GroupLog> {
        let mut logs = vec![GroupLog {
            id: "a".to_string(),
            df: a.clone(),
        }];
        if let Some(df) = b {
            logs.push(GroupLog {
                id: "b".to_string(),
                df: df.clone(),
            });
        }
        logs
    }

    fn dfg_with(a: &DataFrame, b: Option<&DataFrame>, attrs: &[&str], with_start: bool) -> Dfg {
        dfg_with_selection(a, b, attrs, with_start, None)
    }

    fn dfg_with_selection(
        a: &DataFrame,
        b: Option<&DataFrame>,
        attrs: &[&str],
        with_start: bool,
        selection: Option<&[String]>,
    ) -> Dfg {
        let attributes = attrs
            .iter()
            .map(|name| match *name {
                ACTIVITY_DURATION => RequestedAttribute::ActivityDuration,
                TRANSITION_TIME => RequestedAttribute::TransitionTime,
                ACTIVITY_FREQUENCY => RequestedAttribute::ActivityFrequency,
                EDGE_FREQUENCY => RequestedAttribute::EdgeFrequency,
                REPETITIONS => RequestedAttribute::Repetitions,
                name => RequestedAttribute::Column {
                    name: name.to_string(),
                },
            })
            .collect::<Vec<_>>();
        build(&logs(a, b), &mapping(with_start), &attributes, selection).unwrap()
    }

    fn node<'a>(dfg: &'a Dfg, label: &str) -> &'a DfgNode {
        dfg.nodes
            .iter()
            .find(|node| node.label == label)
            .unwrap_or_else(|| panic!("no node labelled {label}"))
    }

    fn transition<'a>(dfg: &'a Dfg, from: &str, to: &str) -> &'a Transition {
        let (source, target) = (node(dfg, from).id, node(dfg, to).id);
        dfg.transitions
            .iter()
            .find(|transition| transition.source == source && transition.target == target)
            .unwrap_or_else(|| panic!("no transition {from} to {to}"))
    }

    fn shape(dfg: &Dfg, variant: &Variant) -> Vec<String> {
        variant
            .activities
            .iter()
            .map(|id| {
                dfg.nodes
                    .iter()
                    .find(|node| node.id == *id)
                    .map(|node| node.label.clone())
                    .unwrap_or_else(|| panic!("a variant names the unknown id {id}"))
            })
            .collect()
    }

    fn n_of(summary: &Summary) -> usize {
        match summary {
            Summary::Numerical { n, .. } | Summary::Categorical { n, .. } => *n,
        }
    }

    #[test]
    fn a_case_arrives_as_its_trace_in_order() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20), ("C", 2, 30)])]),
            None,
            &[],
            false,
        );

        assert_eq!(dfg.nodes.len(), 3);
        assert_eq!(dfg.variants.len(), 1);
        assert_eq!(shape(&dfg, &dfg.variants[0]), ["A", "B", "C"]);
        assert_eq!(dfg.variants[0].cases["a"], 1);
    }

    #[test]
    fn cases_running_the_same_trace_fold_into_one_variant() {
        let dfg = dfg_with(
            &log(&[
                ("1", &[("A", 0, 10), ("B", 1, 20)]),
                ("2", &[("A", 0, 10), ("B", 1, 20)]),
                ("3", &[("A", 0, 10)]),
            ]),
            None,
            &[],
            false,
        );

        assert_eq!(dfg.variants.len(), 2);
        assert_eq!(shape(&dfg, &dfg.variants[0]), ["A"]);
        assert_eq!(dfg.variants[0].cases["a"], 1);
        assert_eq!(shape(&dfg, &dfg.variants[1]), ["A", "B"]);
        assert_eq!(dfg.variants[1].cases["a"], 2);
    }

    #[test]
    fn one_trace_shared_by_both_groups_is_counted_by_id() {
        let a = log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]);
        let b = log(&[("2", &[("A", 0, 90)]), ("3", &[("A", 0, 90), ("B", 1, 90)])]);
        let dfg = dfg_with(&a, Some(&b), &[], false);

        let shared = dfg
            .variants
            .iter()
            .find(|variant| shape(&dfg, variant) == ["A", "B"])
            .unwrap();
        assert_eq!(shared.cases["a"], 1);
        assert_eq!(shared.cases["b"], 1);
    }

    #[test]
    fn a_repeat_lifts_the_event_count_above_the_case_count() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20), ("A", 2, 30)])]),
            None,
            &[],
            false,
        );

        assert_eq!(node(&dfg, "A").counts["a"].cases, 1);
        assert_eq!(node(&dfg, "A").counts["a"].events, 2);
        assert_eq!(shape(&dfg, &dfg.variants[0]), ["A", "B", "A"]);
    }

    #[test]
    fn an_activity_can_follow_itself() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("A", 1, 20)])]),
            None,
            &[TRANSITION_TIME],
            false,
        );

        assert_eq!(shape(&dfg, &dfg.variants[0]), ["A", "A"]);
        let self_loop = transition(&dfg, "A", "A");
        assert_eq!(self_loop.source, self_loop.target);
    }

    #[test]
    fn an_overlapping_activity_never_shows_a_negative_wait() {
        // B starts at 9_500ms, before A completes at 10_000ms: a real overlap,
        // not an ordering artifact (B still completes after A, at 10_500ms).
        let df = DataFrame::new(
            2,
            vec![
                Column::new("case".into(), vec!["1".to_string(), "1".to_string()]),
                Column::new("act".into(), vec!["A".to_string(), "B".to_string()]),
                datetime_column("ts", vec![10_000, 10_500]),
                datetime_column("start", vec![9_000, 9_500]),
                Column::new("cost".into(), vec![10i64, 10i64]),
                Column::new("who".into(), vec!["Bo".to_string(), "Bo".to_string()]),
                Column::new(
                    "region".into(),
                    vec!["south".to_string(), "south".to_string()],
                ),
            ],
        )
        .unwrap();

        let dfg = build(
            &logs(&df, None),
            &mapping(true),
            &[RequestedAttribute::TransitionTime],
            None,
        )
        .unwrap();

        let wait = &transition(&dfg, "A", "B").attributes[TRANSITION_TIME];
        let Summary::Numerical { min, max, .. } = &wait.summaries["a"] else {
            panic!("a wait is numeric");
        };
        assert_eq!(*min, 0.0);
        assert_eq!(*max, 0.0);
    }

    #[test]
    fn a_pair_carries_the_wait_between_its_ends() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[TRANSITION_TIME],
            false,
        );

        assert_eq!(dfg.transitions.len(), 1);
        let wait = &transition(&dfg, "A", "B").attributes[TRANSITION_TIME];
        assert_eq!(n_of(&wait.summaries["a"]), 1);
    }

    #[test]
    fn an_unasked_transition_time_is_never_measured() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[],
            false,
        );

        assert!(dfg
            .transitions
            .iter()
            .all(|transition| !transition.attributes.contains_key(TRANSITION_TIME)));
    }

    #[test]
    fn a_case_level_attribute_is_measured_per_case_rather_than_per_activity() {
        let dfg = dfg_with(
            &log(&[
                ("1", &[("A", 0, 10), ("B", 1, 20)]),
                ("22", &[("A", 0, 10)]),
            ]),
            None,
            &["region", "cost"],
            false,
        );

        assert!(node(&dfg, "A").attributes.contains_key("cost"));
        assert!(!node(&dfg, "A").attributes.contains_key("region"));
        let region = &dfg.case_level["region"];
        let Summary::Categorical { n, counts } = &region.summaries["a"] else {
            panic!("region is categorical");
        };
        assert_eq!(*n, 2);
        assert_eq!(counts["south"], 1);
        assert_eq!(counts["north"], 1);
        assert!(region.test.is_none());
    }

    #[test]
    fn a_case_level_attribute_is_tested_between_groups_on_the_cases_drawn() {
        let south: Vec<Trace> = vec![
            ("1", &[("A", 0, 10)]),
            ("2", &[("A", 0, 10)]),
            ("3", &[("A", 0, 10)]),
            ("4", &[("A", 0, 10)]),
            ("5", &[("A", 0, 10)]),
            ("6", &[("A", 0, 10)]),
        ];
        let north: Vec<Trace> = vec![
            ("11", &[("A", 0, 10)]),
            ("12", &[("A", 0, 10)]),
            ("13", &[("A", 0, 10)]),
            ("14", &[("A", 0, 10)]),
            ("15", &[("A", 0, 10)]),
            ("16", &[("A", 0, 10), ("B", 1, 10)]),
        ];
        let only_a = ["A".to_string()];
        let dfg = dfg_with_selection(
            &log(&south),
            Some(&log(&north)),
            &["region"],
            false,
            Some(&only_a),
        );

        let region = &dfg.case_level["region"];
        assert_eq!(n_of(&region.summaries["a"]), 6);
        assert_eq!(n_of(&region.summaries["b"]), 5);
        let test = region.test.as_ref().expect("both Groups hold enough cases");
        assert!(test.significant);
    }

    #[test]
    fn a_column_named_as_a_derived_attribute_stays_a_column() {
        let mut columns = mapping(false);
        columns.push(
            serde_json::from_str(
                r#"{"name":"Transition Time","role":"other","type":"integer","scope":"event"}"#,
            )
            .unwrap(),
        );
        let requested = [RequestedAttribute::Column {
            name: TRANSITION_TIME.to_string(),
        }];

        let (attributes, wants_transition, _) = build::plan(&requested, &columns, false).unwrap();

        assert_eq!(attributes[0].name, TRANSITION_TIME);
        assert!(!wants_transition);
    }

    #[test]
    fn a_column_and_derived_attribute_with_the_same_name_are_rejected() {
        let requested = [
            RequestedAttribute::Column {
                name: TRANSITION_TIME.to_string(),
            },
            RequestedAttribute::TransitionTime,
        ];

        assert!(matches!(
            build::plan(&requested, &mapping(false), false),
            Err(error) if error.contains("more than once")
        ));
    }

    #[test]
    fn a_categorical_attribute_arrives_counted() {
        let dfg = dfg_with(
            &log(&[
                ("1", &[("A", 0, 10)]),
                ("2", &[("A", 0, 90)]),
                ("3", &[("A", 0, 90)]),
            ]),
            None,
            &["who"],
            false,
        );

        let block = &node(&dfg, "A").attributes["who"];
        let Summary::Categorical { counts, .. } = &block.summaries["a"] else {
            panic!("who is text and summarizes as categories");
        };
        assert_eq!(counts["Ana"], 2);
        assert_eq!(counts["Bo"], 1);
    }

    #[test]
    fn a_repeated_activity_is_one_observation_at_its_mean() {
        let dfg = dfg_with(
            &log(&[
                ("1", &[("A", 0, 10), ("B", 1, 20), ("A", 2, 30)]),
                ("2", &[("A", 0, 70)]),
            ]),
            None,
            &["cost"],
            false,
        );

        let Summary::Numerical { n, min, max, .. } =
            &node(&dfg, "A").attributes["cost"].summaries["a"]
        else {
            panic!("cost is numeric");
        };
        assert_eq!(*n, 2);
        assert_eq!((*min, *max), (20.0, 70.0));
        assert_eq!(node(&dfg, "A").counts["a"].events, 3);
    }

    #[test]
    fn a_category_counts_each_case_that_ever_had_it_once() {
        let dfg = dfg_with(
            &log(&[
                ("1", &[("A", 0, 90), ("A", 1, 90), ("A", 2, 10)]),
                ("2", &[("A", 0, 90)]),
            ]),
            None,
            &["who"],
            false,
        );

        let Summary::Categorical { counts, .. } = &node(&dfg, "A").attributes["who"].summaries["a"]
        else {
            panic!("who is categorical");
        };
        assert_eq!(counts["Ana"], 2);
        assert_eq!(counts["Bo"], 1);
    }

    #[test]
    fn a_pair_followed_twice_in_a_case_is_one_wait() {
        let dfg = dfg_with(
            &log(&[(
                "1",
                &[("A", 0, 10), ("B", 1, 10), ("A", 2, 10), ("B", 5, 10)],
            )]),
            None,
            &[TRANSITION_TIME],
            false,
        );

        let Summary::Numerical { n, mean, .. } =
            &transition(&dfg, "A", "B").attributes[TRANSITION_TIME].summaries["a"]
        else {
            panic!("a wait is numeric");
        };
        assert_eq!(*n, 1);
        assert_eq!(*mean, 2_000.0);
    }

    #[test]
    fn one_group_measures_but_never_tests() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &["cost", TRANSITION_TIME],
            false,
        );

        assert!(!dfg.comparing);
        assert_eq!(dfg.groups.len(), 1);
        assert!(node(&dfg, "A").attributes["cost"].test.is_none());
        assert!(transition(&dfg, "A", "B").attributes[TRANSITION_TIME]
            .test
            .is_none());
    }

    #[test]
    fn two_groups_key_every_measurement_by_id() {
        let a = log(&[("1", &[("A", 0, 10)])]);
        let b = log(&[("2", &[("A", 0, 90)])]);
        let dfg = dfg_with(&a, Some(&b), &["cost"], false);

        assert!(dfg.comparing);
        let node = node(&dfg, "A");
        assert_eq!(node.counts["a"].cases, 1);
        assert_eq!(node.counts["b"].cases, 1);
        assert_eq!(node.attributes["cost"].summaries.len(), 2);
    }

    #[test]
    fn a_separated_attribute_comes_back_significant() {
        let cheap: Vec<Trace> = vec![
            ("1", &[("A", 0, 10)]),
            ("2", &[("A", 0, 11)]),
            ("3", &[("A", 0, 12)]),
            ("4", &[("A", 0, 13)]),
            ("5", &[("A", 0, 14)]),
            ("6", &[("A", 0, 15)]),
        ];
        let dear: Vec<Trace> = vec![
            ("7", &[("A", 0, 90)]),
            ("8", &[("A", 0, 91)]),
            ("9", &[("A", 0, 92)]),
            ("10", &[("A", 0, 93)]),
            ("11", &[("A", 0, 94)]),
            ("12", &[("A", 0, 95)]),
        ];
        let dfg = dfg_with(&log(&cheap), Some(&log(&dear)), &["cost"], false);

        let test = node(&dfg, "A").attributes["cost"].test.as_ref().unwrap();
        assert_eq!(test.test, "mannwhitney");
        assert!(test.significant);
        assert_eq!(test.higher.as_deref(), Some("b"));
    }

    #[test]
    fn too_few_observations_leave_the_summaries_untested() {
        let a = log(&[("1", &[("A", 0, 10)])]);
        let b = log(&[("2", &[("A", 0, 90)])]);
        let dfg = dfg_with(&a, Some(&b), &["cost"], false);

        let block = &node(&dfg, "A").attributes["cost"];
        assert_eq!(block.summaries.len(), 2);
        assert!(block.test.is_none());
    }

    #[test]
    fn overlapping_groups_are_counted_rather_than_rejected() {
        let a = log(&[("1", &[("A", 0, 10)]), ("2", &[("A", 0, 10)])]);
        let b = log(&[("2", &[("A", 0, 90)]), ("3", &[("A", 0, 90)])]);
        let dfg = dfg_with(&a, Some(&b), &[], false);

        assert_eq!(dfg.overlap_cases, 1);
    }

    #[test]
    fn without_a_start_timestamp_the_wait_absorbs_the_activity() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[ACTIVITY_DURATION],
            false,
        );

        assert_eq!(dfg.transition_time_basis, "completeOnly");
        assert!(!dfg.has_activity_duration);
        assert!(!node(&dfg, "A").attributes.contains_key(ACTIVITY_DURATION));
    }

    #[test]
    fn a_start_timestamp_gives_the_activity_a_duration_of_its_own() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[ACTIVITY_DURATION],
            true,
        );

        assert_eq!(dfg.transition_time_basis, "startComplete");
        assert!(dfg.has_activity_duration);
        let block = &node(&dfg, "A").attributes[ACTIVITY_DURATION];
        let Summary::Numerical { median, .. } = &block.summaries["a"] else {
            panic!("a duration is numeric");
        };
        assert_eq!(*median, 500.0);
    }

    #[test]
    fn the_graph_is_numbered_the_same_way_every_time() {
        let df = log(&[("1", &[("B", 0, 10), ("A", 1, 20)])]);
        let first = dfg_with(&df, None, &[], false);
        let second = dfg_with(&df, None, &[], false);

        let ids = |dfg: &Dfg| -> Vec<(usize, String)> {
            dfg.nodes
                .iter()
                .map(|node| (node.id, node.label.clone()))
                .collect()
        };
        assert_eq!(ids(&first), ids(&second));
        assert_eq!(node(&first, "A").id, 2);
        assert_eq!(node(&first, "B").id, 3);
    }

    #[test]
    fn a_variant_selection_drops_the_other_cases_from_every_count() {
        let a = log(&[("1", &[("A", 0, 10), ("B", 1, 20)]), ("2", &[("A", 0, 10)])]);
        let keep = vec![format!("A{}B", "\u{1}")];
        let dfg = dfg_with_selection(&a, None, &[], false, Some(&keep));

        assert_eq!(dfg.variants.len(), 1);
        assert_eq!(shape(&dfg, &dfg.variants[0]), ["A", "B"]);
        assert_eq!(node(&dfg, "A").counts["a"].cases, 1);
        assert_eq!(node(&dfg, "B").counts["a"].cases, 1);
    }

    #[test]
    fn a_variant_selection_scopes_the_attribute_summary_to_included_cases() {
        let a = log(&[("1", &[("A", 0, 10)]), ("2", &[("A", 0, 10), ("B", 1, 20)])]);
        let keep = vec![format!("A{}B", "\u{1}")];
        let dfg = dfg_with_selection(&a, None, &["cost"], false, Some(&keep));

        let block = &node(&dfg, "A").attributes["cost"];
        let Summary::Numerical { n, .. } = &block.summaries["a"] else {
            panic!("cost is numeric");
        };
        assert_eq!(*n, 1);
    }

    #[test]
    fn a_selection_matching_nothing_leaves_the_graph_empty() {
        let a = log(&[("1", &[("A", 0, 10)])]);
        let keep = vec!["nonexistent".to_string()];
        let dfg = dfg_with_selection(&a, None, &[], false, Some(&keep));

        assert!(dfg.nodes.is_empty());
        assert!(dfg.variants.is_empty());
    }

    const CASE_IDS: [&str; 10] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

    fn same_trace<'a>(ids: &[&'a str], events: &'a [(&'a str, i64, i64)]) -> Vec<Trace<'a>> {
        ids.iter().map(|id| (*id, events)).collect()
    }

    #[test]
    fn a_place_one_group_reaches_more_often_is_a_frequency_finding() {
        let through_b = same_trace(&CASE_IDS, &[("A", 0, 10), ("B", 1, 10)]);
        let mut half: Vec<Trace> = same_trace(&CASE_IDS[..5], &[("A", 0, 10), ("B", 1, 10)]);
        half.extend(same_trace(&CASE_IDS[5..], &[("A", 0, 10)]));
        let dfg = dfg_with(
            &log(&through_b),
            Some(&log(&half)),
            &[ACTIVITY_FREQUENCY, EDGE_FREQUENCY],
            false,
        );

        let reach = node(&dfg, "B").attributes[ACTIVITY_FREQUENCY]
            .test
            .as_ref()
            .unwrap();
        assert!(reach.significant);
        assert_eq!(reach.higher.as_deref(), Some("a"));

        let follow = transition(&dfg, "A", "B").attributes[EDGE_FREQUENCY]
            .test
            .as_ref()
            .unwrap();
        assert!(follow.significant);
        assert_eq!(follow.higher.as_deref(), Some("a"));
    }

    #[test]
    fn a_place_one_group_never_reaches_has_no_frequency_test() {
        let through_b = same_trace(&CASE_IDS, &[("A", 0, 10), ("B", 1, 10)]);
        let a_only = same_trace(&CASE_IDS, &[("A", 0, 10)]);
        let dfg = dfg_with(
            &log(&through_b),
            Some(&log(&a_only)),
            &[ACTIVITY_FREQUENCY, EDGE_FREQUENCY],
            false,
        );

        assert!(node(&dfg, "B").attributes[ACTIVITY_FREQUENCY]
            .test
            .is_none());
        assert!(transition(&dfg, "A", "B").attributes[EDGE_FREQUENCY]
            .test
            .is_none());
        let to_end = dfg
            .transitions
            .iter()
            .find(|t| t.source == node(&dfg, "A").id && t.target == END_ID)
            .unwrap();
        assert!(to_end.attributes[EDGE_FREQUENCY].test.is_none());
    }

    #[test]
    fn a_place_every_case_reaches_has_no_frequency_test() {
        let a = same_trace(&CASE_IDS, &[("A", 0, 10)]);
        let dfg = dfg_with(&log(&a), Some(&log(&a)), &[ACTIVITY_FREQUENCY], false);

        let reach = &node(&dfg, "A").attributes[ACTIVITY_FREQUENCY];
        assert!(reach.test.is_none());
        let Summary::Categorical { counts, .. } = &reach.summaries["a"] else {
            panic!("a frequency is categorical");
        };
        assert_eq!(counts["Reached"], 10);
        assert!(!counts.contains_key("Not reached"));
    }

    #[test]
    fn repetitions_are_counted_per_case_that_reaches_the_activity() {
        let thrice = same_trace(&CASE_IDS[..6], &[("A", 0, 10), ("A", 1, 10), ("A", 2, 10)]);
        let once = same_trace(&CASE_IDS[..6], &[("A", 0, 10)]);
        let dfg = dfg_with(&log(&thrice), Some(&log(&once)), &[REPETITIONS], false);

        let block = &node(&dfg, "A").attributes[REPETITIONS];
        let Summary::Numerical { n, median, .. } = &block.summaries["a"] else {
            panic!("repetitions are numeric");
        };
        assert_eq!((*n, *median), (6, 3.0));
        let test = block.test.as_ref().unwrap();
        assert!(test.significant);
        assert_eq!(test.higher.as_deref(), Some("a"));
    }

    #[test]
    fn an_activity_no_case_repeats_measures_no_repetitions() {
        let dfg = dfg_with(&log(&[("1", &[("A", 0, 10)])]), None, &[REPETITIONS], false);

        assert!(!node(&dfg, "A").attributes.contains_key(REPETITIONS));
    }

    #[test]
    fn the_graph_measures_none_of_its_own_tests_unasked() {
        let a = log(&[("1", &[("A", 0, 10), ("A", 1, 10), ("B", 2, 10)])]);
        let dfg = dfg_with(&a, Some(&a), &[], false);

        assert!(node(&dfg, "A").attributes.is_empty());
        assert!(dfg.transitions.is_empty());
    }
}

//! The Directly-Follows Graph, shipped as the log's distinct trace shapes plus
//! what each activity measures. Nothing is pruned, ranked or laid out here.
//!
//! The frontend folds the variants into nodes and edges for whatever set of
//! activities is on screen, so hiding an activity re-links through it with
//! counts the log actually holds rather than with a stand-in. Moving a slider
//! never comes back here, and Rust never learns a Group's name or colour.

mod build;
pub mod commands;

use crate::analysis::{stats, Acc, AttributeBlock, GroupLog, ALPHA, MIN_GROUP_CASES};
use crate::column_mapping::{find_role, ColumnMapping, ColumnRole};
use std::collections::HashMap;

/// Start and End are the frontend's, folded from the variants. Activities take
/// the ids above them, so the two synthetic nodes can never collide.
const FIRST_ACTIVITY_ID: usize = 2;

#[derive(serde::Serialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    /// Distinct cases passing through here at least once.
    pub cases: i64,
    /// Every occurrence. A case visiting the activity twice counts twice.
    pub events: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DfgNode {
    pub id: usize,
    pub label: String,
    /// Over the whole log, whatever the view is showing. The Activities slider
    /// ranks by these.
    pub counts: HashMap<String, Counts>,
    pub attributes: HashMap<String, AttributeBlock>,
}

/// One trace shape and how many cases of each Group ran it.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    /// Node ids, in the order they occurred.
    pub activities: Vec<usize>,
    pub cases: HashMap<String, i64>,
}

/// The wait one directly-follows pair spans. Only pairs the log holds have one,
/// and only when the view asked for the Transition Time.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    pub source: usize,
    pub target: usize,
    pub wait: AttributeBlock,
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
    /// Ordered: carries both the order and the identity of the Groups compared.
    pub groups: Vec<GroupBlock>,
    pub comparing: bool,
    /// Cases in both Groups. Non-zero means the samples are not independent.
    pub overlap_cases: i64,
    pub transition_time_basis: &'static str,
    pub has_activity_duration: bool,
    /// Attributes asked for and dropped: a case-level one holds a single value
    /// per case and has nothing to say about one activity.
    pub skipped_case_level: Vec<String>,
}

pub fn build(
    logs: &[GroupLog],
    mapping: &[ColumnMapping],
    attributes: &[String],
) -> Result<Dfg, String> {
    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let ids: Vec<String> = logs.iter().map(|log| log.id.clone()).collect();
    let aggregates = build::aggregate(logs, mapping, attributes)?;

    let mut labels: Vec<&String> = aggregates.nodes.keys().collect();
    labels.sort();
    let node_id: HashMap<&str, usize> = labels
        .iter()
        .enumerate()
        .map(|(i, label)| (label.as_str(), i + FIRST_ACTIVITY_ID))
        .collect();

    let mut nodes = activity_nodes(&ids, &labels, &node_id, &aggregates);
    correct(&mut nodes, &aggregates);
    let mut transitions = transitions(&ids, &node_id, &aggregates);
    correct_transitions(&mut transitions);

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
        skipped_case_level: aggregates.skipped_case_level,
    })
}

/// One node per activity, in label order so the same log always numbers them
/// the same way.
fn activity_nodes(
    ids: &[String],
    labels: &[&String],
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
) -> Vec<DfgNode> {
    labels
        .iter()
        .map(|label| {
            let node = &aggregates.nodes[*label];
            DfgNode {
                id: node_id[label.as_str()],
                label: (*label).clone(),
                counts: node.counts.clone(),
                attributes: aggregates
                    .attributes
                    .iter()
                    .filter_map(|attr| {
                        let accs = node.attributes.get(&attr.name)?;
                        Some((attr.name.clone(), block(ids, accs, attr.numeric)))
                    })
                    .collect(),
            }
        })
        .collect()
}

/// The trace shapes with their activities resolved to node ids.
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

/// One entry per pair the log holds, in `(source, target)` id order.
fn transitions(
    ids: &[String],
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
) -> Vec<Transition> {
    let mut transitions: Vec<Transition> = aggregates
        .transitions
        .iter()
        .filter_map(|((source, target), accs)| {
            Some(Transition {
                source: node_id.get(source.as_str()).copied()?,
                target: node_id.get(target.as_str()).copied()?,
                wait: block(ids, accs, true),
            })
        })
        .collect();
    transitions.sort_by_key(|transition| (transition.source, transition.target));
    transitions
}

/// One Group's values summarized, and the two compared when there are two.
/// A Group with too few observations gets its Summary and no test.
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

/// Benjamini-Hochberg per attribute family: one attribute across every node of
/// the graph. See `docs/statistics.md`.
fn correct(nodes: &mut [DfgNode], aggregates: &build::Aggregates) {
    for attr in &aggregates.attributes {
        let family: Vec<f64> = nodes
            .iter()
            .filter_map(|node| Some(node.attributes.get(&attr.name)?.test.as_ref()?.p_value))
            .collect();
        let cutoff = stats::benjamini_hochberg(&family, ALPHA);
        for node in nodes.iter_mut() {
            if let Some(test) = node
                .attributes
                .get_mut(&attr.name)
                .and_then(|block| block.test.as_mut())
            {
                test.significant = test.p_value <= cutoff;
            }
        }
    }
}

/// The transition times are their own family: one quantity across every pair.
fn correct_transitions(transitions: &mut [Transition]) {
    let family: Vec<f64> = transitions
        .iter()
        .filter_map(|transition| Some(transition.wait.test.as_ref()?.p_value))
        .collect();
    let cutoff = stats::benjamini_hochberg(&family, ALPHA);
    for transition in transitions.iter_mut() {
        if let Some(test) = transition.wait.test.as_mut() {
            test.significant = test.p_value <= cutoff;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::{Summary, ACTIVITY_DURATION, TRANSITION_TIME};
    // `polars::prelude` ships a `ColumnMapping` of its own, so this one is named
    // in full wherever it appears.
    use crate::column_mapping::ColumnMapping as Mapping;
    use polars::prelude::*;

    /// `region` is the case-level attribute, the one a node cannot measure.
    fn mapping(with_start: bool) -> Vec<Mapping> {
        let mut columns: Vec<Mapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","granularity":"case"},
              {"name":"act","role":"activity_name","type":"string","granularity":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","granularity":"event"},
              {"name":"cost","role":"other","type":"integer","granularity":"event"},
              {"name":"who","role":"other","type":"string","granularity":"event"},
              {"name":"region","role":"other","type":"string","granularity":"case"}
            ]"#,
        )
        .unwrap();
        if with_start {
            columns.push(
                serde_json::from_str(
                    r#"{"name":"start","role":"start_timestamp","type":"datetime","granularity":"event"}"#,
                )
                .unwrap(),
            );
        }
        columns
    }

    /// One case: its id and its events, each `(activity, second, cost)`. The
    /// second is when the activity completes, so a test can make one wait
    /// longer than another. Every activity starts half a second before it
    /// completes, which is what Activity Duration reads.
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
        let timestamp = |name: &str, values: Vec<i64>| {
            Column::new(name.into(), values)
                .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                .unwrap()
        };
        DataFrame::new(
            height,
            vec![
                Column::new("case".into(), cases),
                Column::new("act".into(), acts),
                timestamp("ts", complete),
                timestamp("start", start),
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
        let attributes: Vec<String> = attrs.iter().map(|a| a.to_string()).collect();
        build(&logs(a, b), &mapping(with_start), &attributes).unwrap()
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

    /// A variant as its labels, which reads better in an assertion than ids do.
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
        // The most travelled shape first: two cases ran it against the other's
        // one.
        assert_eq!(shape(&dfg, &dfg.variants[0]), ["A", "B"]);
        assert_eq!(dfg.variants[0].cases["a"], 2);
        assert_eq!(shape(&dfg, &dfg.variants[1]), ["A"]);
        assert_eq!(dfg.variants[1].cases["a"], 1);
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
    fn a_pair_carries_the_wait_between_its_ends() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[TRANSITION_TIME],
            false,
        );

        assert_eq!(dfg.transitions.len(), 1);
        let wait = &transition(&dfg, "A", "B").wait;
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

        assert!(dfg.transitions.is_empty());
    }

    #[test]
    fn a_case_level_attribute_is_reported_rather_than_measured() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10)])]),
            None,
            &["region", "cost"],
            false,
        );

        assert_eq!(dfg.skipped_case_level, vec!["region".to_string()]);
        assert!(node(&dfg, "A").attributes.contains_key("cost"));
        assert!(!node(&dfg, "A").attributes.contains_key("region"));
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
        assert!(transition(&dfg, "A", "B").wait.test.is_none());
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
}

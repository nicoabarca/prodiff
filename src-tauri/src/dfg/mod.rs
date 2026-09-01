//! The Directly-Follows Graph: every node and every edge the log has, with the
//! figures both Groups measure on them and the Fuzzy Miner metrics that rank
//! them. Shipped whole and unpruned.
//!
//! Rust decides nothing about the drawing. It does not resolve conflicting
//! pairs, does not apply a cutoff, does not compute a coordinate, and never
//! learns a Group's name or colour. The frontend simplifies and lays out, so
//! moving a slider never comes back here.

pub mod commands;
mod build;
mod metrics;

use crate::analysis::{stats, Acc, AttributeBlock, GroupLog, ALPHA, MIN_GROUP_CASES};
use crate::column_mapping::{find_role, ColumnMapping, ColumnRole};
use build::Endpoint;
use std::collections::HashMap;

/// The ids Start and End answer to. Activities take the ids above them.
const START_ID: usize = 0;
const END_ID: usize = 1;

#[derive(serde::Serialize, Debug, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    /// Distinct cases passing through here at least once.
    pub cases: i64,
    /// Every occurrence. A case visiting the activity twice counts twice.
    pub events: i64,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NodeKind {
    Start,
    End,
    Activity,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DfgNode {
    pub id: usize,
    pub label: String,
    pub kind: NodeKind,
    /// Unary significance, over the union of the Groups. Feeds the node cutoff.
    pub significance: f64,
    pub counts: HashMap<String, Counts>,
    pub attributes: HashMap<String, AttributeBlock>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DfgEdge {
    pub source: usize,
    pub target: usize,
    /// Binary significance and correlation. Together they feed the edge cutoff.
    pub significance: f64,
    pub correlation: f64,
    pub counts: HashMap<String, Counts>,
    /// The wait between the two activities. `None` on Start and End edges.
    pub transition_time: Option<AttributeBlock>,
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
    pub edges: Vec<DfgEdge>,
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
        .map(|(i, label)| (label.as_str(), i + END_ID + 1))
        .collect();

    let mut nodes = activity_nodes(&ids, &labels, &node_id, &aggregates);
    correct(&mut nodes, &aggregates);
    let mut edges = graph_edges(&ids, &node_id, &aggregates)?;
    correct_edges(&mut edges);
    nodes.splice(0..0, boundary_nodes(&edges));

    Ok(Dfg {
        nodes,
        edges,
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
/// the same way. Significance is normalized over the activities alone: Start
/// and End carry one event per case each and would flatten everything else.
fn activity_nodes(
    ids: &[String],
    labels: &[&String],
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
) -> Vec<DfgNode> {
    let events: Vec<i64> = labels
        .iter()
        .map(|label| union_events(&aggregates.nodes[*label].counts))
        .collect();
    let significance = metrics::significance(&events);

    labels
        .iter()
        .zip(significance)
        .map(|(label, significance)| {
            let node = &aggregates.nodes[*label];
            DfgNode {
                id: node_id[label.as_str()],
                label: (*label).clone(),
                kind: NodeKind::Activity,
                significance,
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

/// The two synthetic nodes, counted from the edges that name them. They are
/// never cut, so their significance is not a measurement.
fn boundary_nodes(edges: &[DfgEdge]) -> Vec<DfgNode> {
    let sum = |pick: fn(&DfgEdge) -> bool| {
        let mut counts: HashMap<String, Counts> = HashMap::new();
        for edge in edges.iter().filter(|edge| pick(edge)) {
            for (id, count) in &edge.counts {
                let total = counts.entry(id.clone()).or_default();
                total.cases += count.cases;
                total.events += count.events;
            }
        }
        counts
    };
    // A case enters through exactly one Start edge and leaves through exactly
    // one End edge, so summing them double-counts nothing.
    vec![
        DfgNode {
            id: START_ID,
            label: "Start".to_string(),
            kind: NodeKind::Start,
            significance: 1.0,
            counts: sum(|edge| edge.source == START_ID),
            attributes: HashMap::new(),
        },
        DfgNode {
            id: END_ID,
            label: "End".to_string(),
            kind: NodeKind::End,
            significance: 1.0,
            counts: sum(|edge| edge.target == END_ID),
            attributes: HashMap::new(),
        },
    ]
}

/// One edge per directly-follows pair, in `(source, target)` id order.
///
/// Significance and correlation are normalized over the inner edges only. A
/// Start or End edge is structure rather than behaviour: it scores 1.0 on both,
/// which is what keeps the cutoff from ever detaching the graph from its ends.
fn graph_edges(
    ids: &[String],
    node_id: &HashMap<&str, usize>,
    aggregates: &build::Aggregates,
) -> Result<Vec<DfgEdge>, String> {
    let id_of = |endpoint: &Endpoint| -> Result<usize, String> {
        match endpoint {
            Endpoint::Start => Ok(START_ID),
            Endpoint::End => Ok(END_ID),
            Endpoint::Activity(label) => node_id
                .get(label.as_str())
                .copied()
                .ok_or_else(|| format!("Edge names an activity no node was built for: {label}")),
        }
    };

    let mut keys: Vec<&(Endpoint, Endpoint)> = aggregates.edges.keys().collect();
    let mut resolved = Vec::with_capacity(keys.len());
    for key in keys.drain(..) {
        resolved.push((id_of(&key.0)?, id_of(&key.1)?, key));
    }
    resolved.sort_by_key(|(source, target, _)| (*source, *target));

    let inner = |(source, target): (usize, usize)| source != START_ID && target != END_ID;
    let events: Vec<i64> = resolved
        .iter()
        .filter(|(source, target, _)| inner((*source, *target)))
        .map(|(_, _, key)| union_events(&aggregates.edges[*key].counts))
        .collect();
    let significance = metrics::significance(&events);
    let waits: Vec<Option<f64>> = resolved
        .iter()
        .filter(|(source, target, _)| inner((*source, *target)))
        .map(|(_, _, key)| mean_wait(&aggregates.edges[*key]))
        .collect();
    let correlation = metrics::proximity(&waits);

    let mut measured = significance.into_iter().zip(correlation);
    Ok(resolved
        .into_iter()
        .map(|(source, target, key)| {
            let edge = &aggregates.edges[key];
            let (significance, correlation) = if inner((source, target)) {
                measured.next().unwrap_or((0.0, 1.0))
            } else {
                (1.0, 1.0)
            };
            DfgEdge {
                source,
                target,
                significance,
                correlation,
                counts: edge.counts.clone(),
                transition_time: (aggregates.wants_transition && inner((source, target)))
                    .then(|| block(ids, &edge.transition, true)),
            }
        })
        .collect())
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

/// The transition times are their own family: one quantity across every edge.
fn correct_edges(edges: &mut [DfgEdge]) {
    let family: Vec<f64> = edges
        .iter()
        .filter_map(|edge| Some(edge.transition_time.as_ref()?.test.as_ref()?.p_value))
        .collect();
    let cutoff = stats::benjamini_hochberg(&family, ALPHA);
    for edge in edges.iter_mut() {
        if let Some(test) = edge
            .transition_time
            .as_mut()
            .and_then(|block| block.test.as_mut())
        {
            test.significant = test.p_value <= cutoff;
        }
    }
}

fn union_events(counts: &HashMap<String, Counts>) -> i64 {
    counts.values().map(|count| count.events).sum()
}

/// The mean wait over both Groups at once, which is what the correlation ranks.
fn mean_wait(edge: &build::EdgeAgg) -> Option<f64> {
    (edge.wait_n > 0).then(|| edge.wait_total / edge.wait_n as f64)
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

    fn edge<'a>(dfg: &'a Dfg, from: &str, to: &str) -> &'a DfgEdge {
        let (source, target) = (node(dfg, from).id, node(dfg, to).id);
        dfg.edges
            .iter()
            .find(|edge| edge.source == source && edge.target == target)
            .unwrap_or_else(|| panic!("no edge {from} to {to}"))
    }

    fn n_of(summary: &Summary) -> usize {
        match summary {
            Summary::Numerical { n, .. } | Summary::Categorical { n, .. } => *n,
        }
    }

    #[test]
    fn a_trace_runs_from_start_to_end() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20), ("C", 2, 30)])]),
            None,
            &[],
            false,
        );

        assert_eq!(dfg.nodes.len(), 5);
        assert_eq!(dfg.nodes[0].kind, NodeKind::Start);
        assert_eq!(dfg.nodes[1].kind, NodeKind::End);
        assert_eq!(dfg.edges.len(), 4);
        assert_eq!(edge(&dfg, "Start", "A").counts["a"].cases, 1);
        assert_eq!(edge(&dfg, "C", "End").counts["a"].cases, 1);
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
        assert_eq!(edge(&dfg, "B", "A").counts["a"].events, 1);
    }

    #[test]
    fn an_activity_can_follow_itself() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("A", 1, 20)])]),
            None,
            &[],
            false,
        );

        let loop_edge = edge(&dfg, "A", "A");
        assert_eq!(loop_edge.source, loop_edge.target);
        assert_eq!(loop_edge.counts["a"].events, 1);
    }

    #[test]
    fn the_busiest_activity_anchors_significance() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20), ("A", 2, 30)])]),
            None,
            &[],
            false,
        );

        assert_eq!(node(&dfg, "A").significance, 1.0);
        assert_eq!(node(&dfg, "B").significance, 0.5);
    }

    #[test]
    fn start_and_end_are_never_what_a_cutoff_drops() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[],
            false,
        );

        assert_eq!(node(&dfg, "Start").significance, 1.0);
        assert_eq!(node(&dfg, "End").significance, 1.0);
        assert_eq!(edge(&dfg, "Start", "A").significance, 1.0);
        assert_eq!(edge(&dfg, "Start", "A").correlation, 1.0);
        assert_eq!(edge(&dfg, "B", "End").correlation, 1.0);
    }

    #[test]
    fn the_shorter_wait_correlates_more() {
        let dfg = dfg_with(
            &log(&[
                ("1", &[("A", 0, 10), ("B", 1, 20)]),
                ("2", &[("C", 0, 10), ("D", 1_000, 20)]),
            ]),
            None,
            &[],
            false,
        );

        assert_eq!(edge(&dfg, "A", "B").correlation, 1.0);
        assert_eq!(edge(&dfg, "C", "D").correlation, 0.0);
    }

    #[test]
    fn only_the_inner_edges_span_a_wait() {
        let dfg = dfg_with(
            &log(&[("1", &[("A", 0, 10), ("B", 1, 20)])]),
            None,
            &[TRANSITION_TIME],
            false,
        );

        assert!(edge(&dfg, "Start", "A").transition_time.is_none());
        assert!(edge(&dfg, "B", "End").transition_time.is_none());
        let wait = edge(&dfg, "A", "B").transition_time.as_ref().unwrap();
        assert_eq!(n_of(&wait.summaries["a"]), 1);
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
        assert!(edge(&dfg, "A", "B")
            .transition_time
            .as_ref()
            .unwrap()
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
}

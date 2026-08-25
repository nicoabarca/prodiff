//! The Comparison Directed Tree: a prefix tree over the Variants of two Groups,
//! with every Node Aggregate and Significance Test computed here and shipped
//! whole. The frontend renders and filters; it never re-aggregates.
//!
//! Two rules shape the structure:
//!
//! * Shared Activity prefixes merge, so the tree branches only where Variants
//!   diverge, and every path from the root to a leaf is one Variant.
//! * A Variant that is a strict prefix of another gets its own leaf: node
//!   identity is `(parent, activity, terminates-here)`, not the prefix alone.
//!   `A→B` and `A→B→C` therefore give `A` two children both labelled `B`, and
//!   the cases split between them.

pub mod commands;
pub mod distributions;
mod stats;

use crate::column_mapping::{find_role, ColumnGranularity, ColumnMapping, ColumnRole, ColumnType};
use polars::prelude::*;
use std::collections::HashMap;

/// Derived attributes. Not columns of the log: the picker offers them alongside
/// the mapped ones and they cost test budget like any other.
pub const ACTIVITY_DURATION: &str = "Activity Duration";
pub const TRANSITION_TIME: &str = "Transition Time";

/// Neither test says anything below this.
const MIN_GROUP_CASES: usize = 5;
/// How many Variants a build ships at most, so a pathological log can't hand
/// the renderer tens of thousands of nodes. Reported via `cappedByCeiling`.
const MAX_VARIANTS: usize = 400;
/// What a build with no explicit limit opens on: the fewest Variants holding
/// this share of the cases.
const DEFAULT_COVERAGE: f64 = 0.8;
const ALPHA: f64 = 0.05;

#[derive(serde::Serialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Summary {
    #[serde(rename_all = "camelCase")]
    Numerical {
        n: usize,
        mean: f64,
        std: f64,
        min: f64,
        q1: f64,
        median: f64,
        q3: f64,
        max: f64,
        /// Tukey whiskers: the extreme observations still within 1.5·IQR of the
        /// box. `min`/`max` are the full range the panel reports.
        whisker_low: f64,
        whisker_high: f64,
        /// Observations past the whiskers, as a count.
        outliers_low: usize,
        outliers_high: usize,
    },
    #[serde(rename_all = "camelCase")]
    Categorical {
        n: usize,
        counts: HashMap<String, i64>,
    },
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Test {
    /// `"mannwhitney"` for numeric attributes, `"chi2"` for categorical.
    pub test: &'static str,
    pub statistic: f64,
    pub p_value: f64,
    /// Magnitude only: rank-biserial for Mann-Whitney, Cramér's V for chi².
    pub effect_size: f64,
    /// Signed rank-biserial: positive = the first Group ranks higher. `None`
    /// for chi², which is non-directional.
    pub effect_signed: Option<f64>,
    /// Benjamini-Hochberg at α = 0.05, corrected within this attribute's family.
    pub significant: bool,
    /// Which Group ranks higher, by id. `None` for chi². An id rather than
    /// "A"/"B" because with three Groups "A higher" would name nothing.
    pub higher: Option<String>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttributeBlock {
    /// One summary per Group, by id. A Group with nothing to summarize is absent.
    pub summaries: HashMap<String, Summary>,
    /// `None` when either Group has fewer than five cases here.
    pub test: Option<Test>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Comovement {
    pub attribute_x: String,
    pub attribute_y: String,
    /// `"concordant"` when both attributes shift the same way between Groups,
    /// `"divergent"` when they shift opposite ways.
    pub relationship: &'static str,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub id: usize,
    /// `None` only for the synthetic Start root.
    pub parent: Option<usize>,
    pub label: String,
    /// Cases reaching this node, by Group id.
    pub cases: HashMap<String, i64>,
    pub event_level: HashMap<String, AttributeBlock>,
    /// The edge from the parent, not the node itself. `None` at the root and
    /// whenever Transition Time wasn't selected.
    pub transition_time: Option<AttributeBlock>,
    pub comovement: Vec<Comovement>,
    /// The Variant this node terminates, `None` on every other node. Every path
    /// from the root ends at exactly one of these, so it is what the view tests
    /// against the selected Variants, on the key the build itself used.
    pub variant_key: Option<String>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GroupBlock {
    pub id: String,
    /// Cases in the Group, before the variant cut, so it can exceed the root
    /// node's count.
    pub case_count: i64,
    pub case_level: HashMap<String, Summary>,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirectedTree {
    pub nodes: Vec<TreeNode>,
    /// The Groups on this tree, in the order they were asked for. One ordered
    /// array carries both order and identity; everything below keys by id.
    /// One entry is single-Group mode, where nothing is compared.
    pub groups: Vec<GroupBlock>,
    pub case_level_tests: HashMap<String, Test>,
    /// Cases in both Groups. Non-zero means the samples are not independent,
    /// which both tests assume. The view warns.
    pub overlap_cases: i64,
    pub variants_total: usize,
    pub variants_included: usize,
    /// Fraction of the two Groups' combined cases the included Variants hold.
    pub case_coverage: f64,
    /// True when the log has more Variants than `MAX_VARIANTS` ships.
    pub capped_by_ceiling: bool,
    /// `startComplete` = start(N) − complete(N−1); `completeOnly` =
    /// complete(N) − complete(N−1), which absorbs the activity's own duration.
    pub transition_time_basis: &'static str,
    pub has_activity_duration: bool,
}

/// One attribute as the builder sees it: where its per-event value comes from
/// and how it must be summarized.
struct AttrSpec {
    name: String,
    numeric: bool,
    source: Source,
}

enum Source {
    /// A mapped column, by name.
    Column(String),
    /// complete − start, per event. Transition Time has no variant here: it is
    /// scoped to the edge and computed once per row alongside the case split.
    Duration,
}

/// Per-event values of one attribute, in row order.
enum Values {
    Num(Vec<Option<f64>>),
    Cat(Vec<Option<String>>),
}

enum Acc {
    Num(Vec<f64>),
    Cat(HashMap<String, i64>),
}

impl Acc {
    fn new(numeric: bool) -> Self {
        if numeric {
            Acc::Num(Vec::new())
        } else {
            Acc::Cat(HashMap::new())
        }
    }

    fn len(&self) -> usize {
        match self {
            Acc::Num(v) => v.len(),
            Acc::Cat(c) => c.values().sum::<i64>() as usize,
        }
    }

    fn summary(&self) -> Option<Summary> {
        match self {
            Acc::Num(v) if v.is_empty() => None,
            Acc::Num(v) => Some(stats::numeric_summary(v)),
            Acc::Cat(c) if c.is_empty() => None,
            Acc::Cat(c) => Some(Summary::Categorical {
                n: c.values().sum::<i64>() as usize,
                counts: c.clone(),
            }),
        }
    }
}

struct NodeBuild {
    parent: Option<usize>,
    label: String,
    cases: [i64; 2],
    /// Set only on a terminal node, which is exactly one Variant's endpoint.
    /// Carried through to `TreeNode` so the view can match a leaf against the
    /// selected Variants without re-deriving the key from node labels.
    variant_key: Option<String>,
    /// One accumulator per attribute per group. Index `attrs.len()` is the
    /// transition into this node, when Transition Time is selected.
    acc: Vec<[Acc; 2]>,
}

/// One Group's rows, already grouped into cases. Rows are persisted sorted by
/// (case, timestamp) and filtering preserves order, so contiguous runs of the
/// case column are whole cases in trace order.
struct GroupRows {
    case_ids: Vec<String>,
    /// `(start, end)` row range per case, parallel to `case_ids`.
    bounds: Vec<(usize, usize)>,
    activities: Vec<String>,
    /// Per attribute, parallel to the `AttrSpec` list.
    values: Vec<Values>,
    /// Time into each event from the previous one; `None` at a case's first
    /// event. Always computed; the selection only decides whether it is shipped.
    transition: Vec<Option<f64>>,
}

fn column_strings(df: &DataFrame, name: &str) -> Result<Vec<Option<String>>, String> {
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

fn column_floats(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, String> {
    let series = df
        .column(name)
        .map_err(|e| e.to_string())?
        .cast(&DataType::Float64)
        .map_err(|e| e.to_string())?;
    Ok(series.f64().map_err(|e| e.to_string())?.iter().collect())
}

fn column_millis(df: &DataFrame, name: &str) -> Result<Vec<Option<f64>>, String> {
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

/// Splits the requested attribute names into the event-level list the tree
/// carries and the case-level list the Group blocks carry, dropping names the
/// mapping doesn't know.
fn plan_attributes(
    requested: &[String],
    mapping: &[ColumnMapping],
    has_start: bool,
) -> (Vec<AttrSpec>, Vec<AttrSpec>, bool) {
    let mut event = Vec::new();
    let mut case_level = Vec::new();
    let mut wants_transition = false;

    for name in requested {
        if name == TRANSITION_TIME {
            wants_transition = true;
            continue;
        }
        if name == ACTIVITY_DURATION {
            if has_start {
                event.push(AttrSpec {
                    name: name.clone(),
                    numeric: true,
                    source: Source::Duration,
                });
            }
            continue;
        }
        let Some(column) = mapping.iter().find(|c| &c.name == name) else {
            continue;
        };
        let spec = AttrSpec {
            name: name.clone(),
            numeric: matches!(column.column_type, ColumnType::Integer | ColumnType::Float),
            source: Source::Column(name.clone()),
        };
        match column.granularity {
            ColumnGranularity::Case => case_level.push(spec),
            _ => event.push(spec),
        }
    }
    (event, case_level, wants_transition)
}

fn read_group(
    df: &DataFrame,
    mapping: &[ColumnMapping],
    attrs: &[AttrSpec],
) -> Result<GroupRows, String> {
    let case_col = crate::column_mapping::require_role(mapping, ColumnRole::CaseId)?;
    let activity_col = crate::column_mapping::require_role(mapping, ColumnRole::ActivityName)?;
    let complete_col = crate::column_mapping::require_role(mapping, ColumnRole::CompleteTimestamp)?;
    let start_col = find_role(mapping, ColumnRole::StartTimestamp);

    let cases = column_strings(df, case_col)?;
    let activities: Vec<String> = column_strings(df, activity_col)?
        .into_iter()
        .map(|v| v.unwrap_or_default())
        .collect();
    let complete = column_millis(df, complete_col)?;
    let start = match start_col {
        Some(name) => Some(column_millis(df, name)?),
        None => None,
    };

    let values = attrs
        .iter()
        .map(|spec| match &spec.source {
            Source::Column(name) if spec.numeric => Ok(Values::Num(column_floats(df, name)?)),
            Source::Column(name) => Ok(Values::Cat(column_strings(df, name)?)),
            Source::Duration => Ok(Values::Num(
                start
                    .as_ref()
                    .expect("Activity Duration is only planned when start is mapped")
                    .iter()
                    .zip(&complete)
                    .map(|(s, c)| match (s, c) {
                        (Some(s), Some(c)) => Some(c - s),
                        _ => None,
                    })
                    .collect(),
            )),
        })
        .collect::<Result<Vec<_>, String>>()?;

    // Contiguous runs of the case column are whole cases, in trace order.
    let mut bounds = Vec::new();
    let mut case_ids = Vec::new();
    let mut row = 0;
    while row < cases.len() {
        let id = cases[row].clone().unwrap_or_default();
        let start_row = row;
        while row < cases.len() && cases[row].clone().unwrap_or_default() == id {
            row += 1;
        }
        case_ids.push(id);
        bounds.push((start_row, row));
    }

    // Transition into event N: from the previous event's completion to this
    // one's start when start timestamps exist, otherwise completion to
    // completion, which absorbs activity N's own duration.
    let mut transition = vec![None; cases.len()];
    for &(from, to) in &bounds {
        for r in (from + 1)..to {
            let arrival = match &start {
                Some(s) => s[r],
                None => complete[r],
            };
            transition[r] = match (arrival, complete[r - 1]) {
                (Some(a), Some(prev)) => Some(a - prev),
                _ => None,
            };
        }
    }

    Ok(GroupRows {
        case_ids,
        bounds,
        activities,
        values,
        transition,
    })
}

fn variant_key(rows: &GroupRows, case: usize) -> String {
    let (from, to) = rows.bounds[case];
    rows.activities[from..to].join("\u{1}")
}

/// Counts cases per Variant across both Groups. `list_variants` ships this to
/// the view, so the picker lists every Variant the filtered log has.
fn variant_counts(groups: &[Option<GroupRows>; 2]) -> HashMap<String, [i64; 2]> {
    let mut counts: HashMap<String, [i64; 2]> = HashMap::new();
    for (group, rows) in groups.iter().enumerate() {
        let Some(rows) = rows else { continue };
        for case in 0..rows.case_ids.len() {
            counts.entry(variant_key(rows, case)).or_default()[group] += 1;
        }
    }
    counts
}

/// The Variant census for the picker. Reads only the case-id and activity
/// columns, so it is cheap enough to run on opening a panel.
pub fn variant_rows(
    ids: &[String],
    group_a: &DataFrame,
    group_b: Option<&DataFrame>,
    mapping: &[ColumnMapping],
) -> Result<Vec<commands::VariantRow>, String> {
    let rows_a = read_group(group_a, mapping, &[])?;
    let rows_b = match group_b {
        Some(df) => Some(read_group(df, mapping, &[])?),
        None => None,
    };
    let groups = [Some(rows_a), rows_b];

    Ok(variant_counts(&groups)
        .into_iter()
        .map(|(key, cases)| commands::VariantRow {
            activities: key.split('\u{1}').map(str::to_string).collect(),
            key,
            cases: by_group(ids, [Some(cases[0]), (ids.len() > 1).then_some(cases[1])]),
        })
        .collect())
}

/// The Variants to include. This cut runs *before* anything is accumulated, so
/// every Node Aggregate and Significance Test downstream describes exactly the
/// Variants included, which is why the selection is a build input.
///
/// `selection` is what the picker has checked, as of the last build. `None` is a
/// cold build and opens on `DEFAULT_COVERAGE` of the cases.
///
/// A selected Variant that no longer exists under these chains is dropped: the
/// chains can change between the picker's last read and this call.
fn cut_variants(
    groups: &[Option<GroupRows>; 2],
    selection: Option<&[String]>,
) -> (Vec<String>, usize, f64, bool) {
    let counts = variant_counts(groups);
    let total_cases: i64 = counts.values().map(|c| c[0] + c[1]).sum();
    let total_variants = counts.len();
    let capped = total_variants > MAX_VARIANTS;

    let covered_by = |keys: &[String]| -> i64 {
        keys.iter()
            .filter_map(|k| counts.get(k))
            .map(|c| c[0] + c[1])
            .sum()
    };
    let coverage = |covered: i64| {
        if total_cases == 0 {
            0.0
        } else {
            covered as f64 / total_cases as f64
        }
    };

    if let Some(selection) = selection {
        // The ceiling still binds, to stop a pathological selection handing the
        // renderer tens of thousands of nodes. Ordering by cases keeps the
        // truncation predictable.
        let mut kept: Vec<String> = selection
            .iter()
            .filter(|k| counts.contains_key(*k))
            .cloned()
            .collect();
        kept.sort_by(|a, b| {
            let (ca, cb) = (counts[a][0] + counts[a][1], counts[b][0] + counts[b][1]);
            cb.cmp(&ca).then_with(|| a.cmp(b))
        });
        kept.truncate(MAX_VARIANTS);
        let covered = covered_by(&kept);
        return (kept, total_variants, coverage(covered), capped);
    }

    let mut ordered: Vec<(String, i64)> = counts
        .iter()
        .map(|(k, c)| (k.clone(), c[0] + c[1]))
        .collect();
    // Case count first, then key, so the same log always opens the same way.
    ordered.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let target = (total_cases as f64 * DEFAULT_COVERAGE).ceil() as i64;
    let mut included = Vec::new();
    let mut covered = 0;
    for (key, count) in ordered {
        // At least one Variant always survives.
        if covered >= target && !included.is_empty() {
            break;
        }
        if included.len() >= MAX_VARIANTS {
            break;
        }
        covered += count;
        included.push(key);
    }

    (included, total_variants, coverage(covered), capped)
}

/// Builds the tree and everything hanging off it. `group_b` is `None` in
/// one-Group mode, where no test runs anywhere. `selection` is the picker's
/// checked Variants; see `cut_variants` for what `None` means.
pub fn build(
    ids: &[String],
    group_a: &DataFrame,
    group_b: Option<&DataFrame>,
    mapping: &[ColumnMapping],
    attributes: &[String],
    selection: Option<&[String]>,
) -> Result<DirectedTree, String> {
    let has_start = find_role(mapping, ColumnRole::StartTimestamp).is_some();
    let (attrs, case_attrs, wants_transition) = plan_attributes(attributes, mapping, has_start);

    let rows_a = read_group(group_a, mapping, &attrs)?;
    let rows_b = match group_b {
        Some(df) => Some(read_group(df, mapping, &attrs)?),
        None => None,
    };
    let groups = [Some(rows_a), rows_b];

    let (included, variants_total, case_coverage, capped_by_ceiling) =
        cut_variants(&groups, selection);
    let included: std::collections::HashSet<String> = included.into_iter().collect();

    // Index `attrs.len()` is the transition into the node, scoped to the edge
    // but accumulating identically.
    let acc_count = attrs.len() + usize::from(wants_transition);
    let new_accs = || -> Vec<[Acc; 2]> {
        attrs
            .iter()
            .map(|s| [Acc::new(s.numeric), Acc::new(s.numeric)])
            .chain(
                wants_transition
                    .then(|| [Acc::new(true), Acc::new(true)])
                    .into_iter(),
            )
            .collect()
    };

    let mut nodes: Vec<NodeBuild> = vec![NodeBuild {
        parent: None,
        label: "Start".to_string(),
        cases: [0, 0],
        variant_key: None,
        acc: new_accs(),
    }];
    let mut index: HashMap<(usize, String, bool), usize> = HashMap::new();

    for (group, rows) in groups.iter().enumerate() {
        let Some(rows) = rows else { continue };
        for case in 0..rows.case_ids.len() {
            let case_variant = variant_key(rows, case);
            if !included.contains(&case_variant) {
                continue;
            }
            let (from, to) = rows.bounds[case];
            nodes[0].cases[group] += 1;

            let mut current = 0usize;
            for row in from..to {
                let terminal = row == to - 1;
                let key = (current, rows.activities[row].clone(), terminal);
                let node = *index.entry(key).or_insert_with(|| {
                    nodes.push(NodeBuild {
                        parent: Some(current),
                        label: rows.activities[row].clone(),
                        cases: [0, 0],
                        // Terminal nodes are keyed on terminating here, so every
                        // case reaching one walked this exact Variant.
                        variant_key: terminal.then(|| case_variant.clone()),
                        acc: new_accs(),
                    });
                    nodes.len() - 1
                });
                nodes[node].cases[group] += 1;

                for (i, values) in rows.values.iter().enumerate() {
                    match (values, &mut nodes[node].acc[i][group]) {
                        (Values::Num(v), Acc::Num(acc)) => {
                            if let Some(value) = v[row] {
                                acc.push(value);
                            }
                        }
                        (Values::Cat(v), Acc::Cat(acc)) => {
                            if let Some(value) = &v[row] {
                                *acc.entry(value.clone()).or_default() += 1;
                            }
                        }
                        _ => {}
                    }
                }
                if wants_transition {
                    if let (Some(value), Acc::Num(acc)) = (
                        rows.transition[row],
                        &mut nodes[node].acc[attrs.len()][group],
                    ) {
                        acc.push(value);
                    }
                }
                current = node;
            }
        }
    }

    // Blocks first, then correction: Benjamini-Hochberg needs every p-value of
    // an attribute's family before any of them can be called significant.
    let comparing = groups[1].is_some();
    let mut blocks: Vec<Vec<AttributeBlock>> = nodes
        .iter()
        .map(|node| {
            (0..acc_count)
                .map(|i| {
                    let numeric = i >= attrs.len() || attrs[i].numeric;
                    let (a, b) = (&node.acc[i][0], &node.acc[i][1]);
                    AttributeBlock {
                        summaries: by_group(ids, [a.summary(), b.summary()]),
                        test: if comparing
                            && a.len() >= MIN_GROUP_CASES
                            && b.len() >= MIN_GROUP_CASES
                        {
                            stats::compare(ids, &[a, b], numeric)
                        } else {
                            None
                        },
                    }
                })
                .collect()
        })
        .collect();

    for i in 0..acc_count {
        let family: Vec<f64> = blocks
            .iter()
            .filter_map(|node| node[i].test.as_ref().map(|t| t.p_value))
            .collect();
        let cutoff = stats::benjamini_hochberg(&family, ALPHA);
        for node in blocks.iter_mut() {
            if let Some(test) = node[i].test.as_mut() {
                test.significant = test.p_value <= cutoff;
            }
        }
    }

    let attr_name = |i: usize| -> String {
        if i < attrs.len() {
            attrs[i].name.clone()
        } else {
            TRANSITION_TIME.to_string()
        }
    };

    let out_nodes = nodes
        .iter()
        .enumerate()
        .zip(blocks)
        .map(|((id, node), node_blocks)| {
            // Co-movement compares Effect Directions, so it needs two numeric
            // attributes that both actually moved.
            let directions: Vec<(usize, f64)> = node_blocks
                .iter()
                .enumerate()
                .filter_map(|(i, block)| {
                    let test = block.test.as_ref()?;
                    let signed = test.effect_signed?;
                    test.significant.then_some((i, signed))
                })
                .collect();
            let mut comovement = Vec::new();
            for (x, (i, si)) in directions.iter().enumerate() {
                for (j, sj) in &directions[x + 1..] {
                    comovement.push(Comovement {
                        attribute_x: attr_name(*i),
                        attribute_y: attr_name(*j),
                        relationship: if si.is_sign_positive() == sj.is_sign_positive() {
                            "concordant"
                        } else {
                            "divergent"
                        },
                    });
                }
            }

            let mut blocks = node_blocks;
            let transition_time = wants_transition.then(|| blocks.remove(attrs.len()));
            TreeNode {
                id,
                parent: node.parent,
                label: node.label.clone(),
                cases: by_group(ids, [Some(node.cases[0]), comparing.then_some(node.cases[1])]),
                event_level: blocks
                    .into_iter()
                    .enumerate()
                    .map(|(i, block)| (attrs[i].name.clone(), block))
                    .collect(),
                transition_time,
                comovement,
                variant_key: node.variant_key.clone(),
            }
        })
        .collect();

    let (group_blocks, case_level_tests) =
        case_level_blocks(ids, &groups, group_a, group_b, &case_attrs)?;

    Ok(DirectedTree {
        nodes: out_nodes,
        groups: group_blocks,
        case_level_tests,
        overlap_cases: overlap(&groups),
        variants_total,
        variants_included: included.len(),
        case_coverage,
        capped_by_ceiling,
        transition_time_basis: if has_start {
            "startComplete"
        } else {
            "completeOnly"
        },
        has_activity_duration: has_start,
    })
}

/// Pairs per-Group values with the ids they belong to, dropping the ones with
/// nothing to say. The internals index Groups positionally; only the payload
/// speaks in ids, and this is where the two meet.
fn by_group<T>(ids: &[String], values: [Option<T>; 2]) -> HashMap<String, T> {
    ids.iter()
        .cloned()
        .zip(values)
        .filter_map(|(id, value)| Some((id, value?)))
        .collect()
}

fn overlap(groups: &[Option<GroupRows>; 2]) -> i64 {
    let (Some(a), Some(b)) = (&groups[0], &groups[1]) else {
        return 0;
    };
    let ids: std::collections::HashSet<&String> = a.case_ids.iter().collect();
    b.case_ids.iter().filter(|id| ids.contains(id)).count() as i64
}

/// Case-level attributes aggregate per Group, not per node: one value per case,
/// taken from its first event. Computed over the whole Group, before the
/// coverage cut, so it matches `case_count`.
fn case_level_blocks(
    ids: &[String],
    groups: &[Option<GroupRows>; 2],
    df_a: &DataFrame,
    df_b: Option<&DataFrame>,
    case_attrs: &[AttrSpec],
) -> Result<(Vec<GroupBlock>, HashMap<String, Test>), String> {
    let per_group = |df: &DataFrame, rows: &GroupRows| -> Result<Vec<Acc>, String> {
        case_attrs
            .iter()
            .map(|spec| {
                let Source::Column(name) = &spec.source else {
                    return Ok(Acc::new(spec.numeric));
                };
                let mut acc = Acc::new(spec.numeric);
                if spec.numeric {
                    let values = column_floats(df, name)?;
                    if let Acc::Num(out) = &mut acc {
                        out.extend(rows.bounds.iter().filter_map(|&(from, _)| values[from]));
                    }
                } else {
                    let values = column_strings(df, name)?;
                    if let Acc::Cat(out) = &mut acc {
                        for &(from, _) in &rows.bounds {
                            if let Some(value) = &values[from] {
                                *out.entry(value.clone()).or_default() += 1;
                            }
                        }
                    }
                }
                Ok(acc)
            })
            .collect()
    };

    let rows_a = groups[0].as_ref().expect("group A is always present");
    let accs_a = per_group(df_a, rows_a)?;
    let accs_b = match (df_b, &groups[1]) {
        (Some(df), Some(rows)) => Some((per_group(df, rows)?, rows.case_ids.len() as i64)),
        _ => None,
    };

    let block = |id: &String, accs: &[Acc], case_count: i64| GroupBlock {
        id: id.clone(),
        case_count,
        case_level: case_attrs
            .iter()
            .zip(accs)
            .filter_map(|(spec, acc)| Some((spec.name.clone(), acc.summary()?)))
            .collect(),
    };

    let mut tests = HashMap::new();
    if let Some((accs_b, _)) = &accs_b {
        let mut computed: Vec<(String, Test)> = case_attrs
            .iter()
            .enumerate()
            .filter_map(|(i, spec)| {
                let (a, b) = (&accs_a[i], &accs_b[i]);
                if a.len() < MIN_GROUP_CASES || b.len() < MIN_GROUP_CASES {
                    return None;
                }
                Some((spec.name.clone(), stats::compare(ids, &[a, b], spec.numeric)?))
            })
            .collect();
        // Case-level attributes are their own family: one test each, no nodes.
        let cutoff = stats::benjamini_hochberg(
            &computed.iter().map(|(_, t)| t.p_value).collect::<Vec<_>>(),
            ALPHA,
        );
        for (name, test) in computed.drain(..) {
            let significant = test.p_value <= cutoff;
            tests.insert(
                name,
                Test {
                    significant,
                    ..test
                },
            );
        }
    }

    let mut blocks = vec![block(&ids[0], &accs_a, rows_a.case_ids.len() as i64)];
    if let (Some(id), Some((accs, count))) = (ids.get(1), &accs_b) {
        blocks.push(block(id, accs, *count));
    }
    Ok((blocks, tests))
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn mapping() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","granularity":"case"},
              {"name":"act","role":"activity_name","type":"string","granularity":"event"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","granularity":"event"},
              {"name":"cost","role":"other","type":"integer","granularity":"event"},
              {"name":"who","role":"other","type":"string","granularity":"event"}
            ]"#,
        )
        .unwrap()
    }

    /// `traces` is one `(case, activities, costs)` per case, at one event per
    /// second so transitions are always 1000 ms.
    pub(super) fn log(traces: &[(&str, &[&str], &[i64])]) -> DataFrame {
        let mut cases = Vec::new();
        let mut acts = Vec::new();
        let mut costs = Vec::new();
        let mut who = Vec::new();
        let mut ts = Vec::new();
        for (case, activities, case_costs) in traces {
            for (i, activity) in activities.iter().enumerate() {
                cases.push(case.to_string());
                acts.push(activity.to_string());
                costs.push(case_costs[i]);
                who.push(if case_costs[i] > 50 { "Ana" } else { "Bo" });
                ts.push(i as i64 * 1_000);
            }
        }
        let height = cases.len();
        DataFrame::new(
            height,
            vec![
                Column::new("case".into(), cases),
                Column::new("act".into(), acts),
                Column::new("ts".into(), ts)
                    .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
                    .unwrap(),
                Column::new("cost".into(), costs),
                Column::new("who".into(), who),
            ],
        )
        .unwrap()
    }

    /// Group ids the tests read results back by. Two when a second frame is
    /// given, one otherwise — the same shape the commands send.
    fn ids(b: Option<&DataFrame>) -> Vec<String> {
        let mut ids = vec!["a".to_string()];
        if b.is_some() {
            ids.push("b".to_string());
        }
        ids
    }

    fn build_with(a: &DataFrame, b: Option<&DataFrame>, attrs: &[&str]) -> DirectedTree {
        let attributes: Vec<String> = attrs.iter().map(|s| s.to_string()).collect();
        build(&ids(b), a, b, &mapping(), &attributes, None).unwrap()
    }

    /// The key the builder gives a trace: activities joined the way
    /// `variant_key` joins them, so tests select the way the picker does.
    fn key(activities: &[&str]) -> String {
        activities.join("\u{1}")
    }

    fn build_selecting(
        a: &DataFrame,
        b: Option<&DataFrame>,
        attrs: &[&str],
        selection: &[&[&str]],
    ) -> DirectedTree {
        let attributes: Vec<String> = attrs.iter().map(|s| s.to_string()).collect();
        let keys: Vec<String> = selection.iter().map(|v| key(v)).collect();
        build(&ids(b), a, b, &mapping(), &attributes, Some(&keys)).unwrap()
    }

    fn labels(tree: &DirectedTree) -> Vec<(Option<usize>, &str, i64, i64)> {
        tree.nodes
            .iter()
            .map(|n| {
                (
                    n.parent,
                    n.label.as_str(),
                    n.cases.get("a").copied().unwrap_or(0),
                    n.cases.get("b").copied().unwrap_or(0),
                )
            })
            .collect()
    }

    #[test]
    fn shared_prefixes_merge_and_the_tree_branches_where_variants_diverge() {
        let df = log(&[("1", &["A", "B"], &[10, 20]), ("2", &["A", "C"], &[10, 30])]);
        let tree = build_with(&df, None, &[]);
        assert_eq!(
            labels(&tree),
            [
                (None, "Start", 2, 0),
                (Some(0), "A", 2, 0),
                (Some(1), "B", 1, 0),
                (Some(1), "C", 1, 0),
            ]
        );
    }

    /// A Variant that is a strict prefix of another gets its own leaf, and the
    /// cases split between the two nodes.
    #[test]
    fn a_prefix_variant_gets_its_own_terminal_node() {
        let df = log(&[
            ("1", &["A", "B"], &[10, 20]),
            ("2", &["A", "B", "C"], &[10, 20, 30]),
            ("3", &["A", "B", "C"], &[10, 20, 30]),
        ]);
        let tree = build_with(&df, None, &[]);
        assert_eq!(
            labels(&tree),
            [
                (None, "Start", 3, 0),
                (Some(0), "A", 3, 0),
                (Some(1), "B", 1, 0), // terminal: case 1 stops here
                (Some(1), "B", 2, 0), // continuing: cases 2 and 3
                (Some(3), "C", 2, 0),
            ]
        );
    }

    /// A build with no limit opens on the common behaviour, and reports the
    /// whole log's Variant count so the slider knows how far it can travel.
    #[test]
    fn an_unlimited_build_opens_on_the_default_coverage() {
        // Nine cases share the variant `A`; `B` and `C` are one case each, so
        // `A` alone already clears 80%.
        let owned: Vec<String> = (0..9).map(|i| format!("c{i}")).collect();
        let traces: Vec<(&str, &[&str], &[i64])> = owned
            .iter()
            .map(|id| (id.as_str(), &["A"][..], &[10i64][..]))
            .chain([
                ("y", &["B"][..], &[10i64][..]),
                ("z", &["C"][..], &[10][..]),
            ])
            .collect();
        let df = log(&traces);

        let tree = build_with(&df, None, &[]);
        assert_eq!(tree.variants_total, 3, "the log still has three");
        assert_eq!(tree.variants_included, 1, "`A` alone covers 9 of 11 cases");
        assert_eq!(tree.nodes.len(), 2, "Start plus the one included leaf");
        assert!(!tree.capped_by_ceiling);

        // Selecting all three brings the tail back.
        let full = build_selecting(&df, None, &[], &[&["A"], &["B"], &["C"]]);
        assert_eq!(full.variants_included, 3);
        assert_eq!(full.nodes.len(), 4, "Start plus one leaf per variant");
        assert!((full.case_coverage - 1.0).abs() < 1e-9);
    }

    /// The whole point of an explicit selection: the user can pick the tail,
    /// which no coverage target or top-K count would ever have reached.
    #[test]
    fn an_explicit_selection_can_pick_the_rare_variants_alone() {
        let owned: Vec<String> = (0..9).map(|i| format!("c{i}")).collect();
        let traces: Vec<(&str, &[&str], &[i64])> = owned
            .iter()
            .map(|id| (id.as_str(), &["A"][..], &[10i64][..]))
            .chain([
                ("y", &["B"][..], &[10i64][..]),
                ("z", &["C"][..], &[10][..]),
            ])
            .collect();
        let df = log(&traces);

        let tail = build_selecting(&df, None, &[], &[&["B"], &["C"]]);
        assert_eq!(tail.variants_included, 2);
        assert_eq!(tail.variants_total, 3, "the log still has three");
        assert!(
            (tail.case_coverage - 2.0 / 11.0).abs() < 1e-9,
            "two of eleven cases"
        );
        let labels: Vec<&str> = tail.nodes.iter().map(|n| n.label.as_str()).collect();
        assert!(!labels.contains(&"A"), "the big Variant was not selected");
    }

    /// A leaf carries the key the build cut on, so the view can match it
    /// against the selection without re-deriving anything.
    #[test]
    fn terminal_nodes_carry_their_variant_key_and_others_do_not() {
        let df = log(&[
            ("1", &["A", "B"], &[10, 20]),
            ("2", &["A", "B", "C"], &[10, 20, 30]),
        ]);
        let tree = build_with(&df, None, &[]);

        let keys: Vec<Option<&str>> = tree
            .nodes
            .iter()
            .map(|n| n.variant_key.as_deref())
            .collect();
        assert_eq!(keys[0], None, "the synthetic Start root terminates nothing");
        assert_eq!(keys[1], None, "`A` is shared by both Variants");

        let mut terminal: Vec<&str> = keys.into_iter().flatten().collect();
        terminal.sort();
        assert_eq!(terminal, [key(&["A", "B"]), key(&["A", "B", "C"])]);
    }

    /// A selected Variant that no longer exists under these chains is dropped,
    /// not fatal: the picker's list can be a moment behind the filters.
    #[test]
    fn a_selected_variant_that_no_longer_exists_is_ignored() {
        let df = log(&[("1", &["A"], &[10]), ("2", &["B"], &[20])]);
        let tree = build_selecting(&df, None, &[], &[&["A"], &["GONE"]]);
        assert_eq!(tree.variants_included, 1);
        assert!((tree.case_coverage - 0.5).abs() < 1e-9);
    }

    /// Cutting Variants in the builder re-derives every Node Aggregate over
    /// exactly the Variants included, so a shared node stops describing cases
    /// that are no longer on screen.
    #[test]
    fn cutting_a_variant_re_derives_the_aggregates_of_the_nodes_above_it() {
        // Six cases go `A→B` at cost 10; five go `A→C` at cost 100. `A` is
        // shared, so what it reports depends on which Variants survive.
        let cheap: Vec<String> = (0..6).map(|i| format!("cheap{i}")).collect();
        let dear: Vec<String> = (0..5).map(|i| format!("dear{i}")).collect();
        let traces: Vec<(&str, &[&str], &[i64])> = cheap
            .iter()
            .map(|id| (id.as_str(), &["A", "B"][..], &[10i64, 10][..]))
            .chain(
                dear.iter()
                    .map(|id| (id.as_str(), &["A", "C"][..], &[100i64, 100][..])),
            )
            .collect();
        let df = log(&traces);

        let mean_at_a = |tree: &DirectedTree| -> f64 {
            let node = tree.nodes.iter().find(|n| n.label == "A").unwrap();
            match node.event_level["cost"].summaries.get("a") {
                Some(Summary::Numerical { mean, .. }) => *mean,
                _ => panic!("expected a numeric summary at `A`"),
            }
        };

        let both = build_selecting(&df, None, &["cost"], &[&["A", "B"], &["A", "C"]]);
        assert_eq!(both.variants_included, 2);
        assert!(
            (mean_at_a(&both) - (6.0 * 10.0 + 5.0 * 100.0) / 11.0).abs() < 1e-9,
            "with both Variants `A` averages all eleven cases"
        );

        let biggest_only = build_selecting(&df, None, &["cost"], &[&["A", "B"]]);
        assert_eq!(biggest_only.variants_included, 1, "`A→B` is the larger");
        assert!(
            (mean_at_a(&biggest_only) - 10.0).abs() < 1e-9,
            "cutting `A→C` must take its cost out of `A`, not just off the canvas"
        );
    }

    /// The ceiling still binds an explicit selection: it exists to stop a
    /// pathological pick handing the renderer tens of thousands of nodes.
    #[test]
    fn a_selection_larger_than_the_ceiling_is_truncated() {
        // One distinct single-activity Variant per case, so the log is wider
        // than the ceiling.
        let count = MAX_VARIANTS + 10;
        let ids: Vec<String> = (0..count).map(|i| format!("c{i}")).collect();
        let names: Vec<String> = (0..count).map(|i| format!("A{i}")).collect();
        let activities: Vec<[&str; 1]> = names.iter().map(|n| [n.as_str()]).collect();

        let traces: Vec<(&str, &[&str], &[i64])> = ids
            .iter()
            .zip(&activities)
            .map(|(id, act)| (id.as_str(), &act[..], &[10i64][..]))
            .collect();
        let df = log(&traces);

        let all: Vec<&[&str]> = activities.iter().map(|act| &act[..]).collect();
        let tree = build_selecting(&df, None, &[], &all);
        assert_eq!(tree.variants_total, count);
        assert_eq!(tree.variants_included, MAX_VARIANTS, "truncated to ceiling");
        assert!(tree.capped_by_ceiling);
    }

    #[test]
    fn a_node_only_one_group_reaches_carries_no_test() {
        let a = log(&[
            ("1", &["A", "B"], &[10, 20]),
            ("2", &["A", "B"], &[10, 20]),
            ("3", &["A", "B"], &[10, 20]),
            ("4", &["A", "B"], &[10, 20]),
            ("5", &["A", "B"], &[10, 20]),
        ]);
        let b = log(&[
            ("6", &["A", "C"], &[90, 80]),
            ("7", &["A", "C"], &[90, 80]),
            ("8", &["A", "C"], &[90, 80]),
            ("9", &["A", "C"], &[90, 80]),
            ("10", &["A", "C"], &[90, 80]),
        ]);
        let tree = build_with(&a, Some(&b), &["cost"]);

        let shared = tree.nodes.iter().find(|n| n.label == "A").unwrap();
        assert!(shared.event_level["cost"].test.is_some());
        let a_only = tree.nodes.iter().find(|n| n.label == "B").unwrap();
        assert!(a_only.event_level["cost"].test.is_none());
        assert_eq!(a_only.cases.get("b").copied().unwrap_or(0), 0);
    }

    #[test]
    fn effect_direction_points_at_the_group_that_runs_higher() {
        let low: Vec<String> = (0..8).map(|i| format!("a{i}")).collect();
        let high: Vec<String> = (0..8).map(|i| format!("b{i}")).collect();
        let a = log(&low
            .iter()
            .map(|id| (id.as_str(), &["A"][..], &[10i64][..]))
            .collect::<Vec<_>>());
        let b = log(&high
            .iter()
            .map(|id| (id.as_str(), &["A"][..], &[90i64][..]))
            .collect::<Vec<_>>());
        let tree = build_with(&a, Some(&b), &["cost"]);

        let node = tree.nodes.iter().find(|n| n.label == "A").unwrap();
        let test = node.event_level["cost"].test.as_ref().unwrap();
        assert_eq!(test.higher.as_deref(), Some("b"));
        assert!(test.effect_signed.unwrap() < 0.0);
        assert!(test.significant, "10 vs 90 with n=8 each is a real gap");
    }

    #[test]
    fn overlapping_groups_are_counted_rather_than_rejected() {
        let df = log(&[("1", &["A"], &[10]), ("2", &["A"], &[20])]);
        let tree = build_with(&df, Some(&df), &[]);
        assert_eq!(tree.overlap_cases, 2);
    }

    #[test]
    fn transition_time_is_the_gap_from_the_previous_event() {
        let df = log(&[("1", &["A", "B"], &[10, 20])]);
        let tree = build_with(&df, None, &[TRANSITION_TIME]);
        let root_child = tree.nodes.iter().find(|n| n.label == "A").unwrap();
        assert!(!root_child
            .transition_time
            .as_ref()
            .unwrap()
            .summaries
            .contains_key("a"));
        let second = tree.nodes.iter().find(|n| n.label == "B").unwrap();
        let Some(Summary::Numerical { mean, n, .. }) =
            second.transition_time.as_ref().unwrap().summaries.get("a")
        else {
            panic!("expected a numeric transition summary");
        };
        assert_eq!(*n, 1);
        assert_eq!(*mean, 1_000.0);
    }
}

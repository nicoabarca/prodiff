//! What every comparison view needs before it has a shape of its own: the
//! Groups it was asked for, the accumulator their per-event values land in, and
//! the Summaries and Significance Tests that come out the other side.
//!
//! Nothing here knows about trees, graphs or nodes. The views build their own
//! structure and hang these types off it.

pub mod stats;

use crate::groups::storage::read_group;
use polars::prelude::*;
use std::collections::HashMap;

/// Derived attributes. Not columns of the log: the picker offers them alongside
/// the mapped ones and they cost test budget like any other.
pub const ACTIVITY_DURATION: &str = "Activity Duration";
pub const TRANSITION_TIME: &str = "Transition Time";

/// Neither test says anything below this.
pub const MIN_GROUP_CASES: usize = 5;
pub const ALPHA: f64 = 0.05;

/// Joins a case's activity sequence into a Variant key. Shared so `tree` and
/// `dfg` derive identical keys: a Variant selection made against one picker's
/// list has to match the other's cases exactly.
pub const VARIANT_KEY_SEP: &str = "\u{1}";

/// One Group's materialized Event Log, carrying the id every payload keys it by.
/// The pipeline is handed these in the order the comparison lists them.
pub struct GroupLog {
    pub id: String,
    pub df: DataFrame,
}

/// The Groups a command was asked for, read from their files, in the order asked.
pub fn read_groups(
    app: &tauri::AppHandle,
    project_id: &str,
    groups: &[String],
) -> Result<Vec<GroupLog>, String> {
    if groups.is_empty() {
        return Err("A comparison needs at least one group.".to_string());
    }
    if groups.len() > 2 {
        return Err(format!(
            "Comparing {} groups is not supported yet; pick two.",
            groups.len()
        ));
    }
    groups
        .iter()
        .map(|id| {
            Ok(GroupLog {
                id: id.clone(),
                df: read_group(app, project_id, id)?,
            })
        })
        .collect()
}

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
        whisker_low: f64,
        whisker_high: f64,
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
    pub test: &'static str,
    pub statistic: f64,
    pub p_value: f64,
    pub effect_size: f64,
    pub effect_signed: Option<f64>,
    pub significant: bool,
    pub higher: Option<String>,
}

#[derive(serde::Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttributeBlock {
    pub summaries: HashMap<String, Summary>,
    pub test: Option<Test>,
}

/// One Group's values of one attribute, in the shape its test needs: raw and
/// unsorted for the numeric case, already counted for the categorical one.
pub enum Acc {
    Num(Vec<f64>),
    Cat(HashMap<String, i64>),
}

impl Acc {
    pub fn new(numeric: bool) -> Self {
        if numeric {
            Acc::Num(Vec::new())
        } else {
            Acc::Cat(HashMap::new())
        }
    }

    pub fn len(&self) -> usize {
        match self {
            Acc::Num(v) => v.len(),
            Acc::Cat(c) => c.values().sum::<i64>() as usize,
        }
    }

    pub fn summary(&self) -> Option<Summary> {
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

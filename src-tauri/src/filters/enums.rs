//! The `Filter` payload and its per-kind mode enums, deserialized straight off
//! the frontend's filter chain JSON.

/// How an event-level predicate is lifted to whole cases.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttributeMode {
    Mandatory,
    Forbidden,
    KeepSelected,
}

/// Numeric filters are always case-level "at least one event satisfies"; the
/// mode picks the comparison.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NumericMode {
    Above,
    Below,
    Between,
    Outside,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimeframeMode {
    Intersects,
    Disjoint,
    Contained,
    Trim,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EndpointMode {
    Mandatory,
    Forbidden,
}

/// Whether a reference event is followed by a follower event, and how closely.
/// The two negatives are exact complements of the two positives: a case with no
/// reference event at all satisfies them, so a mode and its negation partition
/// the log.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FollowerMode {
    Eventually,
    Directly,
    NeverEventually,
    NeverDirectly,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Endpoint {
    Start,
    End,
}

#[derive(serde::Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Filter {
    Attribute {
        column: String,
        mode: AttributeMode,
        values: Vec<String>,
    },
    Numeric {
        column: String,
        mode: NumericMode,
        min: Option<f64>,
        max: Option<f64>,
    },
    Timeframe {
        mode: TimeframeMode,
        from: i64,
        to: i64,
    },
    Endpoint {
        position: Endpoint,
        mode: EndpointMode,
        activities: Vec<String>,
    },
    Duration {
        mode: NumericMode,
        min: Option<f64>,
        max: Option<f64>,
    },
    Follower {
        column: String,
        mode: FollowerMode,
        reference: Vec<String>,
        follower: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    CaseNotInGroup { group_id: String },
}

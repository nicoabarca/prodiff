//! The `Filter` payload and its per-kind mode enums, deserialized straight off
//! the frontend's filter chain JSON.

/// How an event-level predicate is lifted to whole cases.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttributeMode {
    /// Keep cases with at least one matching event. Retained cases stay whole.
    Mandatory,
    /// Drop cases with at least one matching event. Survivors stay whole.
    Forbidden,
    /// Event-level: surviving cases keep only matching events, so their variant
    /// becomes a sub-sequence of the original.
    KeepSelected,
}

/// Numeric filters are always case-level "at least one event satisfies"; the
/// mode picks the comparison.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NumericMode {
    /// `value >= min`
    Above,
    /// `value <= max`
    Below,
    /// `min <= value <= max`, limits included.
    Between,
    /// `value < min || value > max`, limits excluded.
    Outside,
}

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimeframeMode {
    /// Case has at least one event inside the window.
    Intersects,
    /// Case has no event inside the window.
    Disjoint,
    /// Case starts and ends inside the window.
    Contained,
    /// Event-level: keep only the events inside the window.
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
    /// A follower event occurs anywhere after a reference event.
    Eventually,
    /// A follower event is the very next event after a reference event.
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
    /// `from`/`to` are epoch milliseconds, so no date parsing is needed here.
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
    /// `min`/`max` are days and may be fractional. Duration is a case's last
    /// event minus its first.
    Duration {
        mode: NumericMode,
        min: Option<f64>,
        max: Option<f64>,
    },
    /// One column read twice: a case matches when *some* event holding a
    /// `reference` value is followed by *some* event holding a `follower` one.
    Follower {
        column: String,
        mode: FollowerMode,
        reference: Vec<String>,
        follower: Vec<String>,
    },
    /// Keeps the cases that are not in another Group. The only kind that reads
    /// something other than the log: its case ids are resolved before the
    /// pipeline runs. `camelCase` because the id is one, unlike every other
    /// field here.
    #[serde(rename_all = "camelCase")]
    CaseNotInGroup { group_id: String },
}

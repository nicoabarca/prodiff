//! Serializable payloads returned by the filter commands.

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChainStep {
    pub cases: i64,
    pub events: i64,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DurationBin {
    /// Bin edges in milliseconds: `start` inclusive, `end` exclusive except on
    /// the last bin, which has to hold the longest case.
    pub start_ms: f64,
    pub end_ms: f64,
    pub cases: i64,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayLoad {
    /// Midnight UTC of the day, in epoch milliseconds.
    pub day_ms: i64,
    /// Cases running on that day — started on or before it, finished on or
    /// after it. A case is counted on every day of its life, not just the one
    /// it started on, which is what makes this read as workload over time.
    pub cases: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTable {
    pub columns: Vec<String>,
    /// Every cell rendered as a string — the table displays them verbatim and
    /// typed values would only have to be re-formatted on the other side.
    pub rows: Vec<Vec<String>>,
    pub total_events: usize,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DistinctValues {
    pub values: Vec<String>,
    /// True when the column has more distinct values than `limit`. The picker
    /// shows the first `limit` alphabetically rather than refusing to open on
    /// a high-cardinality column such as the case id.
    pub truncated: bool,
}

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
    pub start_ms: f64,
    pub end_ms: f64,
    pub cases: i64,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DayLoad {
    pub day_ms: i64,
    pub cases: i64,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTable {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_events: usize,
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DistinctValues {
    pub values: Vec<String>,
    pub truncated: bool,
}

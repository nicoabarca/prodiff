//! The Column Mapping: the user-confirmed correspondence between an uploaded
//! file's raw columns and the fields process mining requires. It crosses the
//! seam from the frontend intact, as one value.

mod format;

pub use format::to_polars_format;

#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ColumnRole {
    CaseId,
    ActivityName,
    CompleteTimestamp,
    StartTimestamp,
    Other,
}

impl ColumnRole {
    fn label(self) -> &'static str {
        match self {
            Self::CaseId => "case ID",
            Self::ActivityName => "activity",
            Self::CompleteTimestamp => "complete timestamp",
            Self::StartTimestamp => "start timestamp",
            Self::Other => "unmapped",
        }
    }
}

/// Mirrors `ColumnType` in `src/lib/column-mapping.ts`. Only the split between
/// numeric and everything else matters here: it picks which Significance Test an
/// attribute gets.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ColumnType {
    #[default]
    String,
    Integer,
    Float,
    Boolean,
    Date,
    Datetime,
}

impl ColumnType {
    pub fn label(self) -> &'static str {
        match self {
            Self::String => "text",
            Self::Integer => "a whole number",
            Self::Float => "a decimal number",
            Self::Boolean => "true/false",
            Self::Date => "a date",
            Self::Datetime => "a timestamp",
        }
    }
}

/// Event-scoped attributes produce Node Aggregates; case-scoped ones aggregate
/// per Group.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ColumnScope {
    #[default]
    Event,
    Case,
}

/// Which of a case's rows a case-scoped column is read from. The import refuses
/// a `RequireConstant` column whose value moves within a case.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum CaseResolution {
    #[default]
    RequireConstant,
    First,
    Last,
}

/// One mapped column.
#[derive(serde::Deserialize, Debug, Clone)]
pub struct ColumnMapping {
    pub name: String,
    pub role: ColumnRole,
    #[serde(rename = "type", default)]
    pub column_type: ColumnType,
    #[serde(default)]
    pub scope: ColumnScope,
    #[serde(rename = "caseResolution", default)]
    pub case_resolution: CaseResolution,
    #[serde(rename = "timestampFormat", default)]
    pub timestamp_format: Option<String>,
}

pub fn find_role(mapping: &[ColumnMapping], role: ColumnRole) -> Option<&str> {
    mapping
        .iter()
        .find(|c| c.role == role)
        .map(|c| c.name.as_str())
}

/// Looks up a role that the event log cannot be summarized without. The frontend
/// validates this before submitting, so a failure here means a malformed payload.
pub fn require_role(mapping: &[ColumnMapping], role: ColumnRole) -> Result<&str, String> {
    find_role(mapping, role)
        .ok_or_else(|| format!("Column mapping is missing a {} column.", role.label()))
}

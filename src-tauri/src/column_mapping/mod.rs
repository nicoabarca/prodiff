//! The Column Mapping: the user-confirmed correspondence between an uploaded
//! file's raw columns and the fields process mining requires. It crosses the
//! seam from the frontend intact, as one value.

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

/// Mirrors `ColumnGranularity` in `src/lib/column-mapping.ts`. Event-level
/// attributes produce Node Aggregates; case-level ones aggregate per Group.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ColumnGranularity {
    #[default]
    Event,
    Case,
    CaseAndEvent,
}

/// One mapped column.
#[derive(serde::Deserialize, Debug, Clone)]
pub struct ColumnMapping {
    pub name: String,
    pub role: ColumnRole,
    /// Older payloads and the filter tests omit these; both default rather
    /// than failing the whole mapping.
    #[serde(rename = "type", default)]
    pub column_type: ColumnType,
    #[serde(default)]
    pub granularity: ColumnGranularity,
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

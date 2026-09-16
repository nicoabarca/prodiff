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

/// Mirrors `ColumnTyping` in `src/lib/event-log/invokers/types.ts`. The parse
/// pattern belongs to the temporal types alone; `None` there means the reader
/// infers it. Only the split between numeric and everything else matters
/// downstream: it picks which Significance Test an attribute gets.
#[derive(serde::Deserialize, Debug, Clone, PartialEq, Eq, Default)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ColumnType {
    #[default]
    String,
    Integer,
    Float,
    Boolean,
    Date {
        #[serde(rename = "timestampFormat", default)]
        format: Option<String>,
    },
    Datetime {
        #[serde(rename = "timestampFormat", default)]
        format: Option<String>,
    },
}

impl ColumnType {
    pub fn label(&self) -> &'static str {
        match self {
            Self::String => "text",
            Self::Integer => "a whole number",
            Self::Float => "a decimal number",
            Self::Boolean => "true/false",
            Self::Date { .. } => "a date",
            Self::Datetime { .. } => "a timestamp",
        }
    }

    pub fn is_numeric(&self) -> bool {
        matches!(self, Self::Integer | Self::Float)
    }

    /// The pattern the user declared for a temporal column.
    pub fn format(&self) -> Option<&str> {
        match self {
            Self::Date { format } | Self::Datetime { format } => format.as_deref(),
            _ => None,
        }
    }
}

/// Which of a case's rows a case-scoped column is read from. The import refuses
/// a `Constant` column whose value moves within a case.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum CaseResolution {
    #[default]
    Constant,
    First,
    Last,
}

/// Event-scoped attributes produce Node Aggregates; case-scoped ones aggregate
/// per Group. A resolution exists only under `Case`: an event-scoped column has
/// no row to pick.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq, Default)]
#[serde(tag = "scope", rename_all = "snake_case")]
pub enum ColumnScope {
    #[default]
    Event,
    Case {
        #[serde(rename = "caseResolution")]
        resolution: CaseResolution,
    },
}

impl ColumnScope {
    pub fn resolution(self) -> Option<CaseResolution> {
        match self {
            Self::Event => None,
            Self::Case { resolution } => Some(resolution),
        }
    }
}

/// One mapped column.
#[derive(serde::Deserialize, Debug, Clone)]
pub struct ColumnMapping {
    pub name: String,
    pub role: ColumnRole,
    #[serde(flatten)]
    pub column_type: ColumnType,
    #[serde(flatten)]
    pub scope: ColumnScope,
}

pub fn find_role(mapping: &[ColumnMapping], role: ColumnRole) -> Option<&str> {
    mapping
        .iter()
        .find(|c| c.role == role)
        .map(|c| c.name.as_str())
}

/// Looks up a role that the event log cannot be summarized without. The importer
/// validates this before anything reads it, so a failure here means a caller
/// skipped the import.
pub fn require_role(mapping: &[ColumnMapping], role: ColumnRole) -> Result<&str, String> {
    find_role(mapping, role)
        .ok_or_else(|| format!("Column mapping is missing a {} column.", role.label()))
}

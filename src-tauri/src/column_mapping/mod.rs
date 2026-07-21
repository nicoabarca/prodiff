//! The Column Mapping — the user-confirmed correspondence between an uploaded
//! file's raw columns and the fields process mining requires. It crosses the
//! seam from the frontend intact, as one value, rather than as loose per-role
//! column names.

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

/// One mapped column. The frontend also sends `type` and `granularity` on each
/// entry; serde ignores them until Rust has a use for them.
#[derive(serde::Deserialize, Debug, Clone)]
pub struct ColumnMapping {
    pub name: String,
    pub role: ColumnRole,
}

pub fn find_role(mapping: &[ColumnMapping], role: ColumnRole) -> Option<&str> {
    mapping
        .iter()
        .find(|c| c.role == role)
        .map(|c| c.name.as_str())
}

/// Looks up a role that the event log cannot be summarized without. The
/// frontend validates this before submitting, so a failure here means the
/// payload was malformed rather than the user mis-mapping something.
pub fn require_role(mapping: &[ColumnMapping], role: ColumnRole) -> Result<&str, String> {
    find_role(mapping, role)
        .ok_or_else(|| format!("Column mapping is missing a {} column.", role.label()))
}

//! Builds a whole Project from an Event Log, its Custom Attributes and its
//! Groups: the work `pnpm seed` and the study import share.

pub mod bundle;
pub mod commands;

use crate::column_mapping::ColumnMapping;
use crate::custom_attributes::formula::AttributeScope;
use crate::custom_attributes::{self, CustomAttribute, EmptyCount};
use crate::event_log::importer::{
    import_event_log, sibling_dir, swap_into_place, CreateEventLogResult,
};
use crate::groups::{self, GroupFilters};
use std::fs;
use std::path::Path;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInput {
    pub columns: Vec<ColumnMapping>,
    #[serde(default)]
    pub custom_attributes: Vec<CustomAttribute>,
    #[serde(default)]
    pub groups: Vec<GroupFilters>,
}

/// `groups` follows the order the Groups were given.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Built {
    pub event_log: CreateEventLogResult,
    pub custom_attributes: Vec<EmptyCount>,
    pub groups: Vec<serde_json::Value>,
}

/// The Column Mapping with one number column per Custom Attribute, scoped like
/// the attribute, as the app sends it when a Group is applied.
fn analysis_columns(input: &BuildInput) -> Result<Vec<ColumnMapping>, String> {
    let mut columns = input.columns.clone();
    for attribute in &input.custom_attributes {
        let mut entry = serde_json::json!({
            "name": custom_attributes::column_name(&attribute.id),
            "role": "other",
            "scope": "event",
            "type": "float"
        });
        if attribute.scope == AttributeScope::Case {
            entry["scope"] = "case".into();
            entry["caseResolution"] = "constant".into();
        }
        columns.push(serde_json::from_value(entry).map_err(|e| e.to_string())?);
    }
    Ok(columns)
}

/// Imports `source` into `project_dir`, writes the Custom Attributes into it,
/// then applies each Group, which may filter on the Custom Attributes' columns.
/// Writes into `project_dir` step by step; [`build_staged`] is the atomic form.
pub fn build(project_dir: &Path, source: &str, input: &BuildInput) -> Result<Built, String> {
    let imported = import_event_log(project_dir, source, &input.columns, &[])?;
    let empty_counts = custom_attributes::update(
        project_dir,
        &input.custom_attributes,
        &[],
        &[],
        &input.columns,
    )?;
    let columns = analysis_columns(input)?;
    let stats = input
        .groups
        .iter()
        .map(|group| {
            groups::apply(project_dir, group, &columns)
                .and_then(|stats| serde_json::to_value(stats).map_err(|e| e.to_string()))
                .map_err(|e| format!("Group {}: {e}", group.id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Built {
        event_log: imported.event_log,
        custom_attributes: empty_counts,
        groups: stats,
    })
}

/// [`build`] into `.{name}-import` beside `project_dir`, swapped into place only
/// once every step has succeeded. A failure leaves `project_dir` as it was. The
/// paths in the result name files in `project_dir`.
pub fn build_staged(project_dir: &Path, source: &str, input: &BuildInput) -> Result<Built, String> {
    let staging = sibling_dir(project_dir, "import");
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    let result = build(&staging, source, input)
        .and_then(|built| swap_into_place(&staging, project_dir).map(|()| built));
    let mut built = match result {
        Ok(built) => built,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    let event_log = &mut built.event_log;
    event_log.original_path = moved(&event_log.original_path, project_dir);
    event_log.event_log_path = moved(&event_log.event_log_path, project_dir);
    Ok(built)
}

/// `path` with its directory replaced by `dir`.
fn moved(path: &str, dir: &Path) -> String {
    let name = Path::new(path).file_name().unwrap_or_default();
    dir.join(name).to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::groups::storage::read_group;
    use crate::parsing::column_to_strings;
    use std::path::PathBuf;

    const CSV: &str = "\
Case ID,Activity,Complete Timestamp,points,amount
A,Create Fine,2006-07-23 18:00,2,10
A,Payment,2006-08-01 10:00,2,10
B,Create Fine,2006-08-02 09:00,6,20
B,Send Fine,2006-09-10 14:30,6,20
";

    const INPUT: &str = r#"{
      "columns": [
        {"name":"Case ID","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
        {"name":"Activity","role":"activity_name","type":"string","scope":"event"},
        {"name":"Complete Timestamp","role":"complete_timestamp","type":"datetime","scope":"event","timestampFormat":"YYYY-MM-DD HH:mm"},
        {"name":"points","role":"other","type":"integer","scope":"event"},
        {"name":"amount","role":"other","type":"float","scope":"event"}
      ],
      "customAttributes": [
        {"id":"ratio001","formula":{"kind":"binary","op":"/","left":{"kind":"column","name":"points"},"right":{"kind":"column","name":"amount"}}}
      ],
      "groups": [
        {"id":"g1","filters":[{"kind":"numeric","column":"fx_ratio001","mode":"above","min":0.25,"max":null}]}
      ]
    }"#;

    /// A fresh directory under the system temp dir, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("project-import-{label}-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn csv(&self) -> String {
            let path = self.0.join("log.csv");
            fs::write(&path, CSV).unwrap();
            path.to_string_lossy().into_owned()
        }

        fn project(&self) -> PathBuf {
            self.0.join("projects").join("p1")
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn input(json: &str) -> BuildInput {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn a_group_filters_on_a_custom_attribute() {
        let scratch = Scratch::new("build");
        let source = scratch.csv();
        let built = build_staged(&scratch.project(), &source, &input(INPUT)).unwrap();

        assert_eq!(built.custom_attributes.len(), 1);
        assert_eq!(built.groups.len(), 1);
        let group = read_group(&scratch.project(), "g1").unwrap();
        let cases = column_to_strings(&group, "Case ID").unwrap();
        assert_eq!(cases, ["B", "B"]);
        assert!(built
            .event_log
            .event_log_path
            .starts_with(&*scratch.project().to_string_lossy()));
        assert!(!sibling_dir(&scratch.project(), "import").exists());
    }

    #[test]
    fn a_failed_build_leaves_the_project_as_it_was() {
        let scratch = Scratch::new("failed");
        let source = scratch.csv();
        build_staged(&scratch.project(), &source, &input(INPUT)).unwrap();
        let before = fs::read(scratch.project().join("event_log.parquet")).unwrap();

        let broken = INPUT.replace("fx_ratio001", "missing");
        let error = build_staged(&scratch.project(), &source, &input(&broken)).unwrap_err();

        assert!(error.starts_with("Group g1:"), "{error}");
        let after = fs::read(scratch.project().join("event_log.parquet")).unwrap();
        assert_eq!(before, after);
        assert!(read_group(&scratch.project(), "g1").is_ok());
        assert!(!sibling_dir(&scratch.project(), "import").exists());
    }
}

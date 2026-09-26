//! Custom Attributes: formulas the user names, written into the Event Log's
//! Parquet and into every applied Group's as the Float64 column `fx_{id}`.

pub mod commands;
pub mod formula;

use crate::column_mapping::ColumnMapping;
use crate::event_log::storage::event_log_path;
use crate::groups::storage::group_path;
use formula::Formula;
use polars::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const COLUMN_PREFIX: &str = "fx_";

/// The Parquet column a Custom Attribute is written to.
pub fn column_name(id: &str) -> String {
    format!("{COLUMN_PREFIX}{id}")
}

#[derive(Deserialize, Debug, Clone)]
pub struct CustomAttribute {
    pub id: String,
    pub formula: Formula,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EmptyCount {
    pub id: String,
    pub empty: i64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Impact {
    pub events: i64,
    pub empty: i64,
}

/// Fails on an id that could not have come from the frontend, a column name
/// taken by one of the uploaded file's columns, or a formula over anything but
/// visible-to-Rust number columns.
fn validate(set: &[CustomAttribute], columns: &[ColumnMapping]) -> Result<(), String> {
    for attribute in set {
        if attribute.id.is_empty() || !attribute.id.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(format!(
                "\"{}\" is not a Custom Attribute id.",
                attribute.id
            ));
        }
        let name = column_name(&attribute.id);
        if columns.iter().any(|c| c.name == name) {
            return Err(format!("The Event Log already has a column named {name}."));
        }
        attribute.formula.validate(columns)?;
    }
    Ok(())
}

/// Sets and drops Custom Attribute columns on one frame. Every other column is
/// carried through as it was, and dropping a column the frame lacks is a no-op.
fn rewrite(df: DataFrame, set: &[CustomAttribute], remove: &[String]) -> Result<DataFrame, String> {
    let drop: Vec<String> = remove.iter().map(|id| column_name(id)).collect();
    let exprs: Vec<Expr> = set
        .iter()
        .map(|a| a.formula.to_expr().alias(column_name(&a.id)))
        .collect();
    df.lazy()
        .drop(by_name(drop, false, false))
        .with_columns(exprs)
        .collect()
        .map_err(|e| e.to_string())
}

fn read(path: &Path) -> Result<DataFrame, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    ParquetReader::new(file).finish().map_err(|e| e.to_string())
}

fn write(df: &mut DataFrame, path: &Path) -> Result<(), String> {
    let file = fs::File::create(path).map_err(|e| e.to_string())?;
    ParquetWriter::new(file)
        .finish(df)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn staged_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".staged");
    path.with_file_name(name)
}

/// Rewrites one file into its staged sibling. Returns the rewritten frame's
/// empty counts when asked for them.
fn stage(
    path: &Path,
    set: &[CustomAttribute],
    remove: &[String],
    count_empty: bool,
) -> Result<Vec<EmptyCount>, String> {
    let mut df = rewrite(read(path)?, set, remove)?;
    let counts = if count_empty {
        set.iter()
            .map(|a| {
                let column = df.column(&column_name(&a.id)).map_err(|e| e.to_string())?;
                Ok(EmptyCount {
                    id: a.id.clone(),
                    empty: column.null_count() as i64,
                })
            })
            .collect::<Result<Vec<_>, String>>()?
    } else {
        Vec::new()
    };
    write(&mut df, &staged_path(path))?;
    Ok(counts)
}

/// Writes `set` into, and drops `remove` from, the Event Log and every applied
/// Group among `group_ids`. Each file is rewritten on its own thread into a
/// staged sibling; only when every file has succeeded are they renamed into
/// place. A failure removes the staged files and leaves the project as it was.
///
/// Groups are not re-filtered: a formula reads only its own event's row, so it
/// gives the same values on a Group's rows as on the Event Log's.
///
/// Returns each set attribute's empty count over the whole Event Log.
pub fn update(
    project_dir: &Path,
    set: &[CustomAttribute],
    remove: &[String],
    group_ids: &[String],
    columns: &[ColumnMapping],
) -> Result<Vec<EmptyCount>, String> {
    validate(set, columns)?;
    let event_log = event_log_path(project_dir)?;
    let mut paths = vec![event_log];
    paths.extend(
        group_ids
            .iter()
            .map(|id| group_path(project_dir, id))
            .filter(|path| path.exists()),
    );

    let results: Vec<Result<Vec<EmptyCount>, String>> = std::thread::scope(|scope| {
        let handles: Vec<_> = paths
            .iter()
            .enumerate()
            .map(|(i, path)| scope.spawn(move || stage(path, set, remove, i == 0)))
            .collect();
        handles
            .into_iter()
            .map(|h| {
                h.join()
                    .unwrap_or_else(|_| Err("A rewrite thread panicked.".into()))
            })
            .collect()
    });

    let mut counts = Vec::new();
    let mut failure = None;
    for (i, result) in results.into_iter().enumerate() {
        match result {
            Ok(file_counts) if i == 0 => counts = file_counts,
            Ok(_) => {}
            Err(error) => {
                failure.get_or_insert(error);
            }
        }
    }
    if let Some(error) = failure {
        for path in &paths {
            let _ = fs::remove_file(staged_path(path));
        }
        return Err(error);
    }
    for path in &paths {
        fs::rename(staged_path(path), path).map_err(|e| e.to_string())?;
    }
    Ok(counts)
}

/// How many events a draft formula computes and how many read as empty, over
/// the whole Event Log. Writes nothing.
pub fn impact(
    project_dir: &Path,
    formula: &Formula,
    columns: &[ColumnMapping],
) -> Result<Impact, String> {
    formula.validate(columns)?;
    let names: Vec<String> = formula.columns().into_iter().map(str::to_owned).collect();
    let file = fs::File::open(event_log_path(project_dir)?).map_err(|e| e.to_string())?;
    let df = ParquetReader::new(file)
        .with_columns(Some(names))
        .finish()
        .map_err(|e| e.to_string())?;
    let events = df.height() as i64;
    let result = df
        .lazy()
        .select([formula.to_expr().alias("value")])
        .collect()
        .map_err(|e| e.to_string())?;
    let empty = result
        .column("value")
        .map_err(|e| e.to_string())?
        .null_count() as i64;
    Ok(Impact { events, empty })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_log::storage::write_parquet;
    use crate::groups::storage::{read_group, write_group};

    /// A fresh directory under the system temp dir, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("custom-attributes-{label}-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn columns() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"event"},
              {"name":"expense","role":"other","type":"float","scope":"event"},
              {"name":"points","role":"other","type":"integer","scope":"event"}
            ]"#,
        )
        .unwrap()
    }

    /// An Event Log of four events and a Group holding case B's two.
    fn project(label: &str) -> Scratch {
        let scratch = Scratch::new(label);
        let mut log = df!(
            "case" => ["A", "A", "B", "B"],
            "expense" => [Some(0.0), Some(11.0), Some(13.0), None],
            "points" => [2i64, 2, 0, 4]
        )
        .unwrap();
        write_parquet(&mut log, &scratch.0).unwrap();
        let mut group = log.slice(2, 2);
        write_group(&scratch.0, "g1", &mut group).unwrap();
        scratch
    }

    fn attribute(id: &str, json: &str) -> CustomAttribute {
        CustomAttribute {
            id: id.into(),
            formula: serde_json::from_str(json).unwrap(),
        }
    }

    const RATIO: &str = r#"{"kind":"binary","op":"/","left":{"kind":"column","name":"expense"},"right":{"kind":"column","name":"points"}}"#;
    const DOUBLE: &str = r#"{"kind":"binary","op":"*","left":{"kind":"column","name":"points"},"right":{"kind":"number","value":2}}"#;

    fn values(df: &DataFrame, id: &str) -> Vec<Option<f64>> {
        df.column(&column_name(id))
            .unwrap()
            .f64()
            .unwrap()
            .iter()
            .collect()
    }

    fn groups() -> Vec<String> {
        vec!["g1".into(), "never-applied".into()]
    }

    #[test]
    fn writes_the_column_into_the_event_log_and_every_applied_group() {
        let scratch = project("write");
        let counts = update(
            &scratch.0,
            &[attribute("r1", RATIO)],
            &[],
            &groups(),
            &columns(),
        )
        .unwrap();

        assert_eq!(
            counts,
            [EmptyCount {
                id: "r1".into(),
                empty: 2
            }]
        );
        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(values(&log, "r1"), [Some(0.0), Some(5.5), None, None]);
        let group = read_group(&scratch.0, "g1").unwrap();
        assert_eq!(values(&group, "r1"), [None, None]);
        assert!(!group_path(&scratch.0, "never-applied").exists());
    }

    #[test]
    fn leaves_other_custom_attributes_as_they_were() {
        let scratch = project("carry");
        update(
            &scratch.0,
            &[attribute("r1", RATIO)],
            &[],
            &groups(),
            &columns(),
        )
        .unwrap();
        let counts = update(
            &scratch.0,
            &[attribute("d1", DOUBLE)],
            &[],
            &groups(),
            &columns(),
        )
        .unwrap();

        assert_eq!(
            counts,
            [EmptyCount {
                id: "d1".into(),
                empty: 0
            }]
        );
        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(values(&log, "r1"), [Some(0.0), Some(5.5), None, None]);
        assert_eq!(
            values(&log, "d1"),
            [Some(4.0), Some(4.0), Some(0.0), Some(8.0)]
        );
    }

    #[test]
    fn replaces_an_edited_formula_and_drops_a_removed_one() {
        let scratch = project("edit");
        let both = [attribute("r1", RATIO), attribute("d1", DOUBLE)];
        update(&scratch.0, &both, &[], &groups(), &columns()).unwrap();
        update(
            &scratch.0,
            &[attribute("r1", DOUBLE)],
            &["d1".into()],
            &groups(),
            &columns(),
        )
        .unwrap();

        for id in ["original", "g1"] {
            let df = read_group(&scratch.0, id).unwrap();
            assert!(df.column(&column_name("d1")).is_err());
            assert!(values(&df, "r1").iter().all(Option::is_some));
        }
    }

    #[test]
    fn a_failure_leaves_every_file_as_it_was() {
        let scratch = project("failure");
        fs::write(group_path(&scratch.0, "g1"), b"not parquet").unwrap();
        let before = fs::read(event_log_path(&scratch.0).unwrap()).unwrap();

        assert!(update(
            &scratch.0,
            &[attribute("r1", RATIO)],
            &[],
            &groups(),
            &columns()
        )
        .is_err());
        assert_eq!(
            fs::read(event_log_path(&scratch.0).unwrap()).unwrap(),
            before
        );
        let leftovers: Vec<_> = fs::read_dir(&scratch.0)
            .unwrap()
            .chain(fs::read_dir(scratch.0.join("groups")).unwrap())
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".staged"))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn refuses_a_formula_over_a_column_it_cannot_read() {
        let scratch = project("refuse");
        let bad = attribute("r1", r#"{"kind":"column","name":"case"}"#);
        assert!(update(&scratch.0, &[bad], &[], &groups(), &columns()).is_err());
        let log = read_group(&scratch.0, "original").unwrap();
        assert!(log.column(&column_name("r1")).is_err());
    }

    #[test]
    fn refuses_an_id_that_is_not_alphanumeric() {
        let scratch = project("id");
        let error = update(
            &scratch.0,
            &[attribute("../x", RATIO)],
            &[],
            &[],
            &columns(),
        )
        .unwrap_err();
        assert!(error.contains("not a Custom Attribute id"));
    }

    #[test]
    fn impact_measures_a_draft_and_writes_nothing() {
        let scratch = project("impact");
        let before = fs::read(event_log_path(&scratch.0).unwrap()).unwrap();
        let formula = attribute("x", RATIO).formula;

        assert_eq!(
            impact(&scratch.0, &formula, &columns()).unwrap(),
            Impact {
                events: 4,
                empty: 2
            }
        );
        assert_eq!(
            fs::read(event_log_path(&scratch.0).unwrap()).unwrap(),
            before
        );
    }
}

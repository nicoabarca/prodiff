//! Custom Attributes: formulas the user names, written into the Event Log's
//! Parquet and into every applied Group's as the Float64 column `fx_{id}`. An
//! Event Attribute is computed row by row on each file. A Case Attribute is
//! computed once per case on the Event Log and joined into every file by case
//! id, so a case carries the same value in every file.

pub mod commands;
pub mod formula;

use crate::column_mapping::{require_role, ColumnMapping, ColumnRole};
use crate::event_log::storage::event_log_path;
use crate::groups::storage::group_path;
use formula::{AttributeScope, Formula};
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
    #[serde(default)]
    pub scope: AttributeScope,
    pub formula: Formula,
}

/// How many events (Event scope) or cases (Case scope) an attribute left empty.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EmptyCount {
    pub id: String,
    pub empty: i64,
}

/// `total` counts events for Event scope and cases for Case scope.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Impact {
    pub total: i64,
    pub empty: i64,
}

/// Fails on an id that could not have come from the frontend, a column name
/// taken by one of the uploaded file's columns, or a formula its scope refuses.
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
        attribute.formula.validate(attribute.scope, columns)?;
    }
    Ok(())
}

/// One row per case of `lf`: the case id and one column per expression. Rows
/// with no case id belong to no case and are left out.
fn per_case(lf: LazyFrame, case_id: &str, exprs: Vec<Expr>) -> Result<DataFrame, String> {
    lf.filter(col(case_id).is_not_null())
        .group_by_stable([col(case_id)])
        .agg(exprs)
        .collect()
        .map_err(|e| e.to_string())
}

/// Every Case Attribute's value per case, computed on the whole Event Log.
struct Lookup {
    case_id: String,
    frame: DataFrame,
}

/// What Apply does to every file: drop columns, add the row-wise event
/// expressions, then join the case values.
struct Plan {
    ids_to_drop: Vec<String>,
    event: Vec<Expr>,
    lookup: Option<Lookup>,
}

impl Plan {
    fn new(
        log: &DataFrame,
        set: &[CustomAttribute],
        remove: &[String],
        columns: &[ColumnMapping],
    ) -> Result<Self, String> {
        let (case, event): (Vec<&CustomAttribute>, Vec<&CustomAttribute>) =
            set.iter().partition(|a| a.scope == AttributeScope::Case);
        let event = event
            .iter()
            .map(|a| {
                let expr = a.formula.to_expr(AttributeScope::Event, columns)?;
                Ok(expr.alias(column_name(&a.id)))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let lookup = if case.is_empty() {
            None
        } else {
            let case_id = require_role(columns, ColumnRole::CaseId)?.to_owned();
            let exprs = case
                .iter()
                .map(|a| {
                    let expr = a.formula.to_expr(AttributeScope::Case, columns)?;
                    Ok(expr.alias(column_name(&a.id)))
                })
                .collect::<Result<Vec<_>, String>>()?;
            let frame = per_case(log.clone().lazy(), &case_id, exprs)?;
            Some(Lookup { case_id, frame })
        };
        // A Case Attribute's old column is dropped before the join, which would
        // otherwise add the new one beside it with a suffix.
        let ids_to_drop = remove
            .iter()
            .map(String::as_str)
            .chain(case.iter().map(|a| a.id.as_str()))
            .map(column_name)
            .collect();
        Ok(Self {
            ids_to_drop,
            event,
            lookup,
        })
    }

    /// Applies the plan to one file's frame. Every other column is carried
    /// through as it was, and dropping a column the frame lacks is a no-op.
    fn rewrite(&self, df: DataFrame, path: &Path) -> Result<DataFrame, String> {
        let height = df.height();
        let mut lf = df
            .lazy()
            .drop(by_name(self.ids_to_drop.clone(), false, false))
            .with_columns(self.event.clone());
        if let Some(lookup) = &self.lookup {
            let key = [col(lookup.case_id.as_str())];
            lf = lf.join(
                lookup.frame.clone().lazy(),
                key.clone(),
                key,
                JoinArgs {
                    maintain_order: MaintainOrderJoin::Left,
                    ..JoinArgs::new(JoinType::Left)
                },
            );
        }
        let df = lf.collect().map_err(|e| e.to_string())?;
        if df.height() != height {
            return Err(format!(
                "Joining case values changed the row count of {}.",
                path.display()
            ));
        }
        Ok(df)
    }
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

fn null_count(df: &DataFrame, id: &str) -> Result<i64, String> {
    df.column(&column_name(id))
        .map(|column| column.null_count() as i64)
        .map_err(|e| e.to_string())
}

/// Writes `set` into, and drops `remove` from, the Event Log and every applied
/// Group among `group_ids`. The Event Log is rewritten here; each Group is
/// rewritten on its own thread. Every file goes to a staged sibling first, and
/// only when every file has succeeded are they renamed into place, Groups
/// first and the Event Log last. A failure removes the staged files and leaves
/// the project as it was.
///
/// Groups are not re-filtered: an Event Attribute reads only its own event's
/// row, and a Case Attribute's values come from the Event Log by case id, so a
/// Group gets the same values as the Event Log's rows for the same cases.
///
/// Returns each set attribute's empty count, ordered like `set`: events over
/// the whole Event Log for Event scope, cases for Case scope.
pub fn update(
    project_dir: &Path,
    set: &[CustomAttribute],
    remove: &[String],
    group_ids: &[String],
    columns: &[ColumnMapping],
) -> Result<Vec<EmptyCount>, String> {
    validate(set, columns)?;
    let event_log = event_log_path(project_dir)?;
    let log = read(&event_log)?;
    let plan = Plan::new(&log, set, remove, columns)?;
    let mut log = plan.rewrite(log, &event_log)?;
    let counts = set
        .iter()
        .map(|a| {
            let empty = match (&plan.lookup, a.scope) {
                (Some(lookup), AttributeScope::Case) => null_count(&lookup.frame, &a.id)?,
                _ => null_count(&log, &a.id)?,
            };
            Ok(EmptyCount {
                id: a.id.clone(),
                empty,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let groups: Vec<PathBuf> = group_ids
        .iter()
        .map(|id| group_path(project_dir, id))
        .filter(|path| path.exists())
        .collect();
    let mut paths = groups.clone();
    paths.push(event_log.clone());

    let plan = &plan;
    let results: Vec<Result<(), String>> = std::thread::scope(|scope| {
        let mut handles = vec![scope.spawn(|| write(&mut log, &staged_path(&event_log)))];
        handles.extend(groups.iter().map(|path| {
            scope.spawn(move || {
                let mut df = plan.rewrite(read(path)?, path)?;
                write(&mut df, &staged_path(path))
            })
        }));
        handles
            .into_iter()
            .map(|h| {
                h.join()
                    .unwrap_or_else(|_| Err("A rewrite thread panicked.".into()))
            })
            .collect()
    });

    if let Some(error) = results.into_iter().find_map(Result::err) {
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

/// How many events (Event scope) or cases (Case scope) a draft formula
/// computes and how many read as empty, over the whole Event Log. Writes
/// nothing.
pub fn impact(
    project_dir: &Path,
    scope: AttributeScope,
    formula: &Formula,
    columns: &[ColumnMapping],
) -> Result<Impact, String> {
    formula.validate(scope, columns)?;
    let names = formula.read_columns(scope, columns)?;
    let file = fs::File::open(event_log_path(project_dir)?).map_err(|e| e.to_string())?;
    let df = ParquetReader::new(file)
        .with_columns(Some(names))
        .finish()
        .map_err(|e| e.to_string())?;
    let value = formula.to_expr(scope, columns)?.alias("value");
    let result = match scope {
        AttributeScope::Event => df
            .lazy()
            .select([value])
            .collect()
            .map_err(|e| e.to_string())?,
        AttributeScope::Case => {
            let case_id = require_role(columns, ColumnRole::CaseId)?;
            per_case(df.lazy(), case_id, vec![value])?
        }
    };
    let empty = result
        .column("value")
        .map_err(|e| e.to_string())?
        .null_count() as i64;
    Ok(Impact {
        total: result.height() as i64,
        empty,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_log::storage::write_parquet;
    use crate::groups::storage::{read_group, write_group};

    const DAY_MS: i64 = 86_400_000;

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

    fn mapping_fixture() -> Vec<ColumnMapping> {
        serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"ts","role":"complete_timestamp","type":"datetime","scope":"event"},
              {"name":"expense","role":"other","type":"float","scope":"event"},
              {"name":"points","role":"other","type":"integer","scope":"event"},
              {"name":"budget","role":"other","type":"float","scope":"case","caseResolution":"constant"}
            ]"#,
        )
        .unwrap()
    }

    fn timestamps(days: &[Option<i64>]) -> Column {
        let millis: Vec<Option<i64>> = days.iter().map(|d| d.map(|d| d * DAY_MS)).collect();
        Column::new("ts".into(), millis)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .unwrap()
    }

    /// An Event Log of four events, case A over 2 days and case B over 4, with
    /// a Group `g1` holding case B's two events and a Trimmed Group `t1` holding
    /// only B's second.
    fn project(label: &str) -> Scratch {
        let scratch = Scratch::new(label);
        let mut log = df!(
            "case" => ["A", "A", "B", "B"],
            "expense" => [Some(0.0), Some(11.0), Some(13.0), None],
            "points" => [2i64, 2, 0, 4],
            "budget" => [10.0, 10.0, 20.0, 20.0]
        )
        .unwrap();
        log.with_column(timestamps(&[Some(0), Some(2), Some(0), Some(4)]))
            .unwrap();
        write_parquet(&mut log, &scratch.0).unwrap();
        write_group(&scratch.0, "g1", &mut log.slice(2, 2)).unwrap();
        write_group(&scratch.0, "t1", &mut log.slice(3, 1)).unwrap();
        scratch
    }

    fn event(id: &str, json: &str) -> CustomAttribute {
        CustomAttribute {
            id: id.into(),
            scope: AttributeScope::Event,
            formula: serde_json::from_str(json).unwrap(),
        }
    }

    fn case(id: &str, json: &str) -> CustomAttribute {
        CustomAttribute {
            scope: AttributeScope::Case,
            ..event(id, json)
        }
    }

    const RATIO: &str = r#"{"kind":"binary","op":"/","left":{"kind":"column","name":"expense"},"right":{"kind":"column","name":"points"}}"#;
    const DOUBLE: &str = r#"{"kind":"binary","op":"*","left":{"kind":"column","name":"points"},"right":{"kind":"number","value":2}}"#;
    const PER_DAY: &str = r#"{"kind":"binary","op":"/","left":{"kind":"aggregate","fn":"sum","column":"expense"},"right":{"kind":"duration"}}"#;
    const BUDGET_PER_EVENT: &str = r#"{"kind":"binary","op":"/","left":{"kind":"column","name":"budget"},"right":{"kind":"count"}}"#;

    fn values(df: &DataFrame, id: &str) -> Vec<Option<f64>> {
        df.column(&column_name(id))
            .unwrap()
            .f64()
            .unwrap()
            .iter()
            .collect()
    }

    fn groups() -> Vec<String> {
        vec!["g1".into(), "t1".into(), "never-applied".into()]
    }

    fn empty(id: &str, empty: i64) -> EmptyCount {
        EmptyCount {
            id: id.into(),
            empty,
        }
    }

    fn apply(scratch: &Scratch, set: &[CustomAttribute], remove: &[String]) -> Vec<EmptyCount> {
        update(&scratch.0, set, remove, &groups(), &mapping_fixture()).unwrap()
    }

    #[test]
    fn writes_the_column_into_the_event_log_and_every_applied_group() {
        let scratch = project("write");
        let counts = apply(&scratch, &[event("r1", RATIO)], &[]);

        assert_eq!(counts, [empty("r1", 2)]);
        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(values(&log, "r1"), [Some(0.0), Some(5.5), None, None]);
        let group = read_group(&scratch.0, "g1").unwrap();
        assert_eq!(values(&group, "r1"), [None, None]);
        assert!(!group_path(&scratch.0, "never-applied").exists());
    }

    #[test]
    fn leaves_other_custom_attributes_as_they_were() {
        let scratch = project("carry");
        apply(&scratch, &[event("r1", RATIO)], &[]);
        let counts = apply(&scratch, &[event("d1", DOUBLE)], &[]);

        assert_eq!(counts, [empty("d1", 0)]);
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
        apply(&scratch, &[event("r1", RATIO), event("d1", DOUBLE)], &[]);
        apply(&scratch, &[event("r1", DOUBLE)], &["d1".into()]);

        for id in ["original", "g1"] {
            let df = read_group(&scratch.0, id).unwrap();
            assert!(df.column(&column_name("d1")).is_err());
            assert!(values(&df, "r1").iter().all(Option::is_some));
        }
    }

    #[test]
    fn writes_one_whole_case_value_into_the_event_log_and_every_group() {
        let scratch = project("case");
        apply(&scratch, &[case("c1", PER_DAY)], &[]);

        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(
            values(&log, "c1"),
            [Some(5.5), Some(5.5), Some(3.25), Some(3.25)]
        );
        let group = read_group(&scratch.0, "g1").unwrap();
        assert_eq!(values(&group, "c1"), [Some(3.25), Some(3.25)]);
        let trimmed = read_group(&scratch.0, "t1").unwrap();
        assert_eq!(values(&trimmed, "c1"), [Some(3.25)]);
    }

    #[test]
    fn joining_case_values_keeps_every_row_in_its_order() {
        let scratch = project("order");
        let before = read_group(&scratch.0, "g1").unwrap();
        apply(&scratch, &[case("c1", PER_DAY)], &[]);

        let after = read_group(&scratch.0, "g1").unwrap();
        assert_eq!(after.height(), before.height());
        for name in ["case", "ts", "expense", "points", "budget"] {
            assert_eq!(
                after.column(name).unwrap(),
                before.column(name).unwrap(),
                "{name}"
            );
        }
    }

    #[test]
    fn an_edited_case_attribute_replaces_its_column() {
        let scratch = project("case-edit");
        apply(&scratch, &[case("c1", PER_DAY)], &[]);
        apply(&scratch, &[case("c1", BUDGET_PER_EVENT)], &[]);

        for id in ["original", "g1", "t1"] {
            let df = read_group(&scratch.0, id).unwrap();
            let fx: Vec<_> = df
                .get_column_names()
                .into_iter()
                .filter(|name| name.starts_with(COLUMN_PREFIX))
                .map(|name| name.to_string())
                .collect();
            assert_eq!(fx, [column_name("c1")], "{id}");
        }
        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(
            values(&log, "c1"),
            [Some(5.0), Some(5.0), Some(10.0), Some(10.0)]
        );
    }

    #[test]
    fn a_mixed_set_counts_empty_events_and_empty_cases() {
        let scratch = Scratch::new("mixed");
        let mut log = df!(
            "case" => ["A", "A", "B"],
            "expense" => [Some(1.0), Some(3.0), Some(5.0)],
            "points" => [Some(1i64), None, Some(1)],
            "budget" => [10.0, 10.0, 20.0]
        )
        .unwrap();
        log.with_column(timestamps(&[Some(0), Some(2), Some(0)]))
            .unwrap();
        write_parquet(&mut log, &scratch.0).unwrap();

        let counts = update(
            &scratch.0,
            &[event("r1", RATIO), case("c1", PER_DAY)],
            &[],
            &[],
            &mapping_fixture(),
        )
        .unwrap();

        assert_eq!(counts, [empty("r1", 1), empty("c1", 1)]);
        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(values(&log, "r1"), [Some(1.0), None, Some(5.0)]);
        assert_eq!(values(&log, "c1"), [Some(2.0), Some(2.0), None]);
    }

    #[test]
    fn rows_with_no_case_id_get_no_case_value() {
        let scratch = Scratch::new("null-case");
        let mut log = df!(
            "case" => [Some("A"), None, Some("A")],
            "expense" => [1.0, 2.0, 3.0],
            "points" => [1i64, 1, 1],
            "budget" => [10.0, 10.0, 10.0]
        )
        .unwrap();
        log.with_column(timestamps(&[Some(0), Some(1), Some(1)]))
            .unwrap();
        write_parquet(&mut log, &scratch.0).unwrap();

        let counts = update(
            &scratch.0,
            &[case("c1", PER_DAY)],
            &[],
            &[],
            &mapping_fixture(),
        )
        .unwrap();

        assert_eq!(counts, [empty("c1", 0)]);
        let log = read_group(&scratch.0, "original").unwrap();
        assert_eq!(values(&log, "c1"), [Some(4.0), None, Some(4.0)]);
    }

    #[test]
    fn a_failure_leaves_every_file_as_it_was() {
        for set in [event("r1", RATIO), case("c1", PER_DAY)] {
            let scratch = project("failure");
            fs::write(group_path(&scratch.0, "g1"), b"not parquet").unwrap();
            let before = fs::read(event_log_path(&scratch.0).unwrap()).unwrap();
            let trimmed = fs::read(group_path(&scratch.0, "t1")).unwrap();

            assert!(update(&scratch.0, &[set], &[], &groups(), &mapping_fixture()).is_err());
            assert_eq!(
                fs::read(event_log_path(&scratch.0).unwrap()).unwrap(),
                before
            );
            assert_eq!(fs::read(group_path(&scratch.0, "t1")).unwrap(), trimmed);
            let leftovers: Vec<_> = fs::read_dir(&scratch.0)
                .unwrap()
                .chain(fs::read_dir(scratch.0.join("groups")).unwrap())
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .filter(|name| name.ends_with(".staged"))
                .collect();
            assert!(leftovers.is_empty());
        }
    }

    #[test]
    fn refuses_a_formula_its_scope_cannot_read() {
        let scratch = project("refuse");
        for bad in [
            event("r1", r#"{"kind":"column","name":"case"}"#),
            event("r1", r#"{"kind":"column","name":"budget"}"#),
            case("r1", r#"{"kind":"column","name":"expense"}"#),
        ] {
            assert!(update(&scratch.0, &[bad], &[], &groups(), &mapping_fixture()).is_err());
        }
        let log = read_group(&scratch.0, "original").unwrap();
        assert!(log.column(&column_name("r1")).is_err());
    }

    #[test]
    fn refuses_an_id_that_is_not_alphanumeric() {
        let scratch = project("id");
        let error = update(
            &scratch.0,
            &[event("../x", RATIO)],
            &[],
            &[],
            &mapping_fixture(),
        )
        .unwrap_err();
        assert!(error.contains("not a Custom Attribute id"));
    }

    #[test]
    fn reads_an_attribute_with_no_scope_as_event_scope() {
        let attribute: CustomAttribute =
            serde_json::from_str(&format!(r#"{{"id":"r1","formula":{RATIO}}}"#)).unwrap();
        assert_eq!(attribute.scope, AttributeScope::Event);
    }

    #[test]
    fn impact_measures_a_draft_and_writes_nothing() {
        let scratch = project("impact");
        let before = fs::read(event_log_path(&scratch.0).unwrap()).unwrap();

        assert_eq!(
            impact(
                &scratch.0,
                AttributeScope::Event,
                &event("x", RATIO).formula,
                &mapping_fixture()
            )
            .unwrap(),
            Impact { total: 4, empty: 2 }
        );
        assert_eq!(
            fs::read(event_log_path(&scratch.0).unwrap()).unwrap(),
            before
        );
    }

    #[test]
    fn impact_of_a_case_attribute_counts_cases() {
        let scratch = project("impact-case");
        let zero_on_a = r#"{"kind":"binary","op":"/","left":{"kind":"aggregate","fn":"min","column":"expense"},"right":{"kind":"aggregate","fn":"min","column":"expense"}}"#;

        assert_eq!(
            impact(
                &scratch.0,
                AttributeScope::Case,
                &case("x", zero_on_a).formula,
                &mapping_fixture()
            )
            .unwrap(),
            Impact { total: 2, empty: 1 }
        );
    }
}

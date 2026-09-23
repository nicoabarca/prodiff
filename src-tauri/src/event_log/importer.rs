//! The import pipeline: a raw upload and its Column Mapping in, a project
//! directory holding the original and the normalized Event Log out.

use super::storage::{copy_original, original_file_name, write_parquet, EVENT_LOG_FILE};
use crate::column_mapping::{
    find_role, require_role, to_polars_format, CaseResolution, ColumnMapping, ColumnRole,
    ColumnType,
};
use crate::groups::{self, GroupFilters};
use crate::parsing::{column_to_strings, read_csv};
use crate::stats::{summarize, EventLogStats};
use polars::prelude::*;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

fn target_dtype(column_type: &ColumnType) -> DataType {
    match column_type {
        ColumnType::String => DataType::String,
        ColumnType::Integer => DataType::Int64,
        ColumnType::Float => DataType::Float64,
        ColumnType::Boolean => DataType::Boolean,
        ColumnType::Date { .. } => DataType::Date,
        ColumnType::Datetime { .. } => DataType::Datetime(TimeUnit::Milliseconds, None),
    }
}

fn constant_case_column_names(columns: &[ColumnMapping]) -> Vec<String> {
    columns
        .iter()
        .filter(|column| {
            column.role == ColumnRole::Other
                && column.scope.resolution() == Some(CaseResolution::Constant)
        })
        .map(|column| column.name.clone())
        .collect()
}

/// Writes every column in its declared type. The cast is strict: a column that
/// cannot be read as its declared type fails the import, naming itself.
fn cast_to_declared(mut df: DataFrame, columns: &[ColumnMapping]) -> Result<DataFrame, String> {
    for mapping in columns {
        // A column missing from the file is nothing to cast.
        let Ok(column) = df.column(&mapping.name) else {
            continue;
        };
        let target = target_dtype(&mapping.column_type);
        // Timestamps keep the precision and zone the CSV parse gave them.
        let already = column.dtype() == &target
            || matches!(
                (column.dtype(), &target),
                (DataType::Datetime(..), DataType::Datetime(..))
            );
        if already {
            continue;
        }

        if matches!(target, DataType::Date | DataType::Datetime(..)) {
            let parsed = parse_temporal(
                column.as_materialized_series(),
                mapping,
                mapping.column_type.format(),
            )?;
            df.with_column(parsed).map_err(|e| e.to_string())?;
            continue;
        }
        let cast = column.strict_cast(&target).map_err(|cause| {
            format!(
                "Column \"{}\" cannot be read as {}: {cause}",
                mapping.name,
                mapping.column_type.label()
            )
        })?;
        df.with_column(cast).map_err(|e| e.to_string())?;
    }
    Ok(df)
}

fn parse_temporal(
    series: &Series,
    mapping: &ColumnMapping,
    pattern: Option<&str>,
) -> Result<Column, String> {
    let text = series.cast(&DataType::String).map_err(|cause| {
        format!(
            "Column \"{}\" cannot be read as text: {cause}",
            mapping.name
        )
    })?;
    let format = pattern.map(to_polars_format);
    let strings = text.str().map_err(|e| e.to_string())?;
    let described = match pattern {
        Some(p) => format!("with the format {p}"),
        None => "as a timestamp".to_string(),
    };

    let parsed: Series = match mapping.column_type {
        ColumnType::Date { .. } => strings
            .as_date(format.as_deref(), false)
            .map_err(|cause| {
                format!(
                    "Column \"{}\" cannot be read {described}: {cause}",
                    mapping.name
                )
            })?
            .into_series(),
        _ => strings
            .as_datetime(
                format.as_deref(),
                TimeUnit::Milliseconds,
                false,
                false,
                None,
                &StringChunked::from_iter(std::iter::once(Some("raise"))),
            )
            .map_err(|cause| {
                format!(
                    "Column \"{}\" cannot be read {described}: {cause}",
                    mapping.name
                )
            })?
            .into_series(),
    };

    if parsed.null_count() > series.null_count() {
        for i in 0..strings.len() {
            let Some(raw) = strings.get(i) else { continue };
            let is_null = matches!(parsed.get(i), Ok(AnyValue::Null));
            if raw.trim().is_empty() || !is_null {
                continue;
            }
            return Err(match pattern {
                Some(p) => format!(
                    "Column \"{}\": the value \"{raw}\" at row {} does not match the format {p}.",
                    mapping.name,
                    i + 1
                ),
                None => format!(
                    "Column \"{}\": the value \"{raw}\" at row {} could not be read as a timestamp.",
                    mapping.name,
                    i + 1
                ),
            });
        }
    }

    Ok(parsed.with_name(series.name().clone()).into_column())
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventLogResult {
    #[serde(flatten)]
    pub stats: EventLogStats,
    pub original_path: String,
    pub event_log_path: String,
}

/// An import together with the figures of each Group applied during it, in the
/// order the Groups were given.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportWithGroups {
    pub event_log: CreateEventLogResult,
    pub groups: Vec<EventLogStats>,
}

/// Checks the mapping against the file's header: every header column mapped
/// exactly once, nothing unknown, and the required roles present once each.
fn validate_mapping(columns: &[ColumnMapping], header: &[String]) -> Result<(), String> {
    if columns.is_empty() {
        return Err("Column mapping must be a non-empty array.".to_string());
    }
    let mut seen = HashSet::new();
    for column in columns {
        if !header.contains(&column.name) {
            return Err(format!(
                "Column mapping references an unknown column: {}",
                column.name
            ));
        }
        if !seen.insert(column.name.as_str()) {
            return Err(format!(
                "Column \"{}\" is mapped more than once.",
                column.name
            ));
        }
    }
    if seen.len() != header.len() {
        return Err("Column mapping must include every column from the event log.".to_string());
    }

    let count = |role| columns.iter().filter(|c| c.role == role).count();
    for (role, name) in [
        (ColumnRole::CaseId, "case_id"),
        (ColumnRole::ActivityName, "activity_name"),
        (ColumnRole::CompleteTimestamp, "complete_timestamp"),
    ] {
        if count(role) != 1 {
            return Err(format!("Exactly one column must have the {name} role."));
        }
    }
    if count(ColumnRole::StartTimestamp) > 1 {
        return Err("At most one column can have the start_timestamp role.".to_string());
    }
    Ok(())
}

/// `.{name}-tmp`, beside `project_dir`.
fn staging_dir(project_dir: &Path) -> PathBuf {
    sibling_dir(project_dir, "tmp")
}

/// `.{name}-old`, beside `project_dir`: where the files being replaced are held
/// until the new ones are in place.
fn previous_dir(project_dir: &Path) -> PathBuf {
    sibling_dir(project_dir, "old")
}

fn sibling_dir(project_dir: &Path, suffix: &str) -> PathBuf {
    let name = project_dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    project_dir.with_file_name(format!(".{name}-{suffix}"))
}

/// Replaces `project_dir` with `staging`, both siblings, so the directory is
/// either the old import or the new one and never partly written.
fn swap_into_place(staging: &Path, project_dir: &Path) -> Result<(), String> {
    let previous = previous_dir(project_dir);
    if previous.exists() {
        fs::remove_dir_all(&previous).map_err(|e| e.to_string())?;
    }
    let replacing = project_dir.exists();
    if replacing {
        fs::rename(project_dir, &previous).map_err(|e| e.to_string())?;
    }
    if let Err(error) = fs::rename(staging, project_dir) {
        if replacing {
            let _ = fs::rename(&previous, project_dir);
        }
        return Err(error.to_string());
    }
    let _ = fs::remove_dir_all(&previous);
    Ok(())
}

fn write_staged(
    staging: &Path,
    source_path: &str,
    df: &mut DataFrame,
    columns: &[ColumnMapping],
    groups: &[GroupFilters],
) -> Result<Vec<EventLogStats>, String> {
    fs::create_dir_all(staging).map_err(|e| e.to_string())?;
    copy_original(source_path, staging)?;
    write_parquet(df, staging)?;
    groups
        .iter()
        .map(|group| {
            groups::apply(staging, group, columns).map_err(|e| format!("Group {}: {e}", group.id))
        })
        .collect()
}

/// Imports the Event Log at `source_path` into `project_dir`, replacing whatever
/// was there, and applies `groups` to it in order. A failure, in the import or
/// in any Group, leaves `project_dir` as it was and no staging directory behind.
pub fn import_event_log(
    project_dir: &Path,
    source_path: &str,
    columns: &[ColumnMapping],
    groups: &[GroupFilters],
) -> Result<ImportWithGroups, String> {
    let df = read_csv(source_path, None).map_err(|e| e.to_string())?;
    let header: Vec<String> = df
        .get_column_names()
        .into_iter()
        .map(|name| name.to_string())
        .collect();
    validate_mapping(columns, &header)?;
    let mut df = cast_to_declared(df, columns)?;

    let case_col = require_role(columns, ColumnRole::CaseId)?;
    let constant_case_columns = constant_case_column_names(columns);
    if let Some(violation) = case_column_violations(&df, case_col, &constant_case_columns)?
        .into_iter()
        .next()
    {
        return Err(format!(
            "Case-scoped column \"{}\" is not constant: case \"{}\" contains both \"{}\" and \"{}\".",
            violation.column,
            violation.example_case,
            violation.example_values[0],
            violation.example_values[1],
        ));
    }

    // Every later count and trace analysis assumes each case's events run in
    // timestamp order.
    let end_ts_col = require_role(columns, ColumnRole::CompleteTimestamp)?;
    let mut sort_cols = vec![case_col, end_ts_col];
    if let Some(start_ts_col) = find_role(columns, ColumnRole::StartTimestamp) {
        sort_cols.push(start_ts_col);
    }
    df = df
        .sort(sort_cols, SortMultipleOptions::default())
        .map_err(|e| e.to_string())?;

    let stats = summarize(&df, columns)?;

    let staging = staging_dir(project_dir);
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| e.to_string())?;
    }
    let group_stats = match write_staged(&staging, source_path, &mut df, columns, groups) {
        Ok(group_stats) => group_stats,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    if let Err(error) = swap_into_place(&staging, project_dir) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    Ok(ImportWithGroups {
        event_log: CreateEventLogResult {
            stats,
            original_path: project_dir
                .join(original_file_name(source_path))
                .to_string_lossy()
                .into_owned(),
            event_log_path: project_dir
                .join(EVENT_LOG_FILE)
                .to_string_lossy()
                .into_owned(),
        },
        groups: group_stats,
    })
}

/// One case-scoped column whose value is not constant within at least one case.
#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaseColumnViolation {
    pub column: String,
    pub cases: usize,
    pub example_case: String,
    pub example_values: Vec<String>,
}

struct CaseValue<'a> {
    first: &'a str,
    violates_constant: bool,
}

/// Counts the cases in which a column carries more than one distinct non-null
/// value. Nulls never violate on their own, and cases need not be contiguous.
pub(crate) fn case_column_violations(
    df: &DataFrame,
    case_column: &str,
    columns: &[String],
) -> Result<Vec<CaseColumnViolation>, String> {
    let cases = column_to_strings(df, case_column)?;
    let mut violations = Vec::new();

    for column in columns {
        let values = column_to_strings(df, column)?;
        if values.len() != cases.len() {
            return Err(format!("Column \"{column}\" has a different height."));
        }
        let mut seen: HashMap<&str, CaseValue<'_>> = HashMap::new();
        let mut violation_count = 0;
        let mut example = None;
        for (case, value) in cases.iter().zip(&values) {
            if value.is_empty() {
                continue;
            }
            match seen.get_mut(case.as_str()) {
                None => {
                    seen.insert(
                        case,
                        CaseValue {
                            first: value,
                            violates_constant: false,
                        },
                    );
                }
                Some(state) => {
                    if value != state.first && !state.violates_constant {
                        state.violates_constant = true;
                        violation_count += 1;
                        if example.is_none() {
                            example = Some((case.as_str(), state.first, value.as_str()));
                        }
                    }
                }
            }
        }
        if let Some((example_case, first_value, other_value)) = example {
            violations.push(CaseColumnViolation {
                column: column.clone(),
                cases: violation_count,
                example_case: example_case.to_string(),
                example_values: vec![first_value.to_string(), other_value.to_string()],
            });
        }
    }
    Ok(violations)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping(name: &str, column_type: &str) -> Vec<ColumnMapping> {
        serde_json::from_str(&format!(
            r#"[{{"name":"{name}","role":"other","type":"{column_type}","scope":"event"}}]"#
        ))
        .expect("mapping payload should deserialize")
    }

    fn timed_mapping(name: &str, column_type: &str, format: &str) -> Vec<ColumnMapping> {
        serde_json::from_str(&format!(
            r#"[{{"name":"{name}","role":"other","type":"{column_type}","scope":"event","timestampFormat":"{format}"}}]"#
        ))
        .expect("mapping payload should deserialize")
    }

    fn text_column(name: &str, values: &[&str]) -> DataFrame {
        DataFrame::new(
            values.len(),
            vec![Column::new(name.into(), values.to_vec())],
        )
        .unwrap()
    }

    fn millis(df: &DataFrame, name: &str) -> Vec<Option<i64>> {
        let cast = df.column(name).unwrap().cast(&DataType::Int64).unwrap();
        let values = cast.i64().unwrap();
        (0..values.len()).map(|i| values.get(i)).collect()
    }

    /// All-digit resource id: inferred as integer, re-declared as text.
    fn numeric_resource() -> DataFrame {
        DataFrame::new(3, vec![Column::new("res".into(), [561i64, 561, 3_302])]).unwrap()
    }

    fn case_frame(cases: &[&str], values: &[Option<&str>]) -> DataFrame {
        DataFrame::new(
            cases.len(),
            vec![
                Column::new("case".into(), cases.to_vec()),
                Column::new("region".into(), values.to_vec()),
            ],
        )
        .unwrap()
    }

    fn violations(cases: &[&str], values: &[Option<&str>]) -> Vec<CaseColumnViolation> {
        case_column_violations(&case_frame(cases, values), "case", &["region".to_string()]).unwrap()
    }

    #[test]
    fn only_constant_case_attributes_need_validation() {
        let mapping: Vec<ColumnMapping> = serde_json::from_str(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"region","role":"other","type":"string","scope":"case","caseResolution":"constant"},
              {"name":"owner","role":"other","type":"string","scope":"case","caseResolution":"first"},
              {"name":"resource","role":"other","type":"string","scope":"event"}
            ]"#,
        )
        .unwrap();

        assert_eq!(constant_case_column_names(&mapping), ["region"]);
    }

    #[test]
    fn a_column_constant_within_every_case_has_no_violation() {
        assert!(violations(
            &["a", "a", "b"],
            &[Some("North"), Some("North"), Some("South")]
        )
        .is_empty());
    }

    #[test]
    fn nulls_do_not_break_constancy() {
        assert!(violations(&["a", "a", "a"], &[Some("North"), None, Some("North")]).is_empty());
    }

    #[test]
    fn a_case_with_no_value_at_all_is_constant() {
        assert!(violations(&["a", "a"], &[None, None]).is_empty());
    }

    #[test]
    fn a_column_that_moves_within_a_case_is_reported_with_a_count_and_an_example() {
        let found = violations(
            &["a", "a", "b", "b", "c"],
            &[
                Some("North"),
                Some("South"),
                Some("East"),
                Some("West"),
                Some("North"),
            ],
        );

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].column, "region");
        assert_eq!(found[0].cases, 2, "case c is constant and does not count");
        assert_eq!(found[0].example_case, "a");
        assert_eq!(found[0].example_values, vec!["North", "South"]);
    }

    #[test]
    fn a_case_split_across_the_file_is_still_one_case() {
        let found = violations(
            &["a", "b", "a"],
            &[Some("North"), Some("East"), Some("South")],
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].cases, 1);
    }

    #[test]
    fn the_declared_format_decides_what_a_timestamp_means() {
        let day_first = cast_to_declared(
            text_column("ts", &["05/03/2024 00:00:00"]),
            &timed_mapping("ts", "datetime", "DD/MM/YYYY HH:mm:ss"),
        )
        .unwrap();
        let month_first = cast_to_declared(
            text_column("ts", &["05/03/2024 00:00:00"]),
            &timed_mapping("ts", "datetime", "MM/DD/YYYY HH:mm:ss"),
        )
        .unwrap();

        assert_eq!(
            day_first.column("ts").unwrap().dtype(),
            &DataType::Datetime(TimeUnit::Milliseconds, None)
        );
        assert_ne!(
            millis(&day_first, "ts"),
            millis(&month_first, "ts"),
            "March 5th and May 3rd are not the same instant"
        );
    }

    #[test]
    fn a_value_the_declared_format_cannot_read_fails_the_import() {
        let error = cast_to_declared(
            text_column("ts", &["15/03/2024 00:00:00", "2024-03-16 00:00:00"]),
            &timed_mapping("ts", "datetime", "DD/MM/YYYY HH:mm:ss"),
        )
        .unwrap_err();

        assert!(error.contains("ts"), "names the column: {error}");
        assert!(
            error.contains("2024-03-16 00:00:00"),
            "quotes the offending value: {error}"
        );
        assert!(error.contains("row 2"), "points at the row: {error}");
        assert!(
            error.contains("DD/MM/YYYY HH:mm:ss"),
            "quotes the pattern the user picked, not the Polars one: {error}"
        );
    }

    #[test]
    fn blank_values_are_missing_data_rather_than_a_format_mismatch() {
        let df = cast_to_declared(
            text_column("ts", &["15/03/2024", "", "16/03/2024"]),
            &timed_mapping("ts", "date", "DD/MM/YYYY"),
        )
        .unwrap();

        assert_eq!(df.column("ts").unwrap().dtype(), &DataType::Date);
        assert_eq!(df.column("ts").unwrap().null_count(), 1);
    }

    #[test]
    fn a_column_without_a_declared_format_still_casts() {
        let df = cast_to_declared(
            text_column("ts", &["2024-03-15 00:00:00"]),
            &mapping("ts", "datetime"),
        )
        .unwrap();

        assert!(matches!(
            df.column("ts").unwrap().dtype(),
            DataType::Datetime(..)
        ));
    }

    #[test]
    fn declared_type_wins_over_the_inferred_one() {
        let df = cast_to_declared(numeric_resource(), &mapping("res", "string")).unwrap();
        assert_eq!(df.column("res").unwrap().dtype(), &DataType::String);
    }

    #[test]
    fn a_column_that_cannot_be_read_as_its_declared_type_fails_the_import() {
        let df = DataFrame::new(2, vec![Column::new("res".into(), ["561", "NIL"])]).unwrap();
        let error = cast_to_declared(df, &mapping("res", "integer")).unwrap_err();
        assert!(error.contains("\"res\""), "the column is named: {error}");
        assert!(
            error.contains("a whole number"),
            "the declared type is named: {error}"
        );
    }

    #[test]
    fn a_column_already_in_its_declared_type_is_left_alone() {
        let df = cast_to_declared(numeric_resource(), &mapping("res", "integer")).unwrap();
        assert_eq!(df.column("res").unwrap().dtype(), &DataType::Int64);
    }

    #[test]
    fn a_parsed_timestamp_keeps_the_precision_the_csv_reader_gave_it() {
        let ts = Column::new("ts".into(), [0i64, 1_000])
            .cast(&DataType::Datetime(TimeUnit::Microseconds, None))
            .unwrap();
        let df = cast_to_declared(
            DataFrame::new(2, vec![ts]).unwrap(),
            &mapping("ts", "datetime"),
        )
        .unwrap();
        assert_eq!(
            df.column("ts").unwrap().dtype(),
            &DataType::Datetime(TimeUnit::Microseconds, None)
        );
    }

    const FINES_CSV: &str = "\
Case ID,Activity,Complete Timestamp,vehicleClass
B7,Create Fine,2006-08-02 09:00,C
A1,Send Fine,2006-12-04 20:00,
A1,Create Fine,2006-07-23 18:00,A
B7,Payment,2006-09-10 14:30,C
";

    const FINES_COLUMNS: &str = r#"[
      {"name":"Case ID","role":"case_id","type":"string","scope":"case","caseResolution":"constant"},
      {"name":"Activity","role":"activity_name","type":"string","scope":"event"},
      {"name":"Complete Timestamp","role":"complete_timestamp","type":"datetime","scope":"event","timestampFormat":"YYYY-MM-DD HH:mm"},
      {"name":"vehicleClass","role":"other","type":"string","scope":"case","caseResolution":"first"}
    ]"#;

    /// A fresh directory under the system temp dir, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("importer-{label}-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn csv(&self, text: &str) -> String {
            let path = self.0.join("log.csv");
            fs::write(&path, text).unwrap();
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

    fn fines_columns() -> Vec<ColumnMapping> {
        serde_json::from_str(FINES_COLUMNS).unwrap()
    }

    fn header(names: &[&str]) -> Vec<String> {
        names.iter().map(|n| n.to_string()).collect()
    }

    fn validation_error(json: &str, names: &[&str]) -> String {
        let columns: Vec<ColumnMapping> = serde_json::from_str(json).unwrap();
        validate_mapping(&columns, &header(names)).unwrap_err()
    }

    const ROLES_HEADER: &[&str] = &["case", "activity", "end"];

    fn roles_mapping(roles: [&str; 3]) -> String {
        format!(
            r#"[
              {{"name":"case","role":"{}","type":"string","scope":"event"}},
              {{"name":"activity","role":"{}","type":"string","scope":"event"}},
              {{"name":"end","role":"{}","type":"datetime","scope":"event"}}
            ]"#,
            roles[0], roles[1], roles[2]
        )
    }

    #[test]
    fn an_import_writes_the_original_and_a_sorted_event_log() {
        let scratch = Scratch::new("happy");
        let source = scratch.csv(FINES_CSV);
        let project = scratch.project();

        let result = import_event_log(&project, &source, &fines_columns(), &[])
            .unwrap()
            .event_log;

        assert_eq!(result.stats.events, 4);
        assert_eq!(result.stats.cases, 2);
        assert_eq!(result.stats.activities, 3);
        assert_eq!(result.stats.variants, 2);
        assert_eq!(
            PathBuf::from(&result.original_path),
            project.join("original.csv")
        );
        assert_eq!(
            PathBuf::from(&result.event_log_path),
            project.join("event_log.parquet")
        );
        assert_eq!(
            fs::read_to_string(&result.original_path).unwrap(),
            FINES_CSV
        );

        let file = fs::File::open(&result.event_log_path).unwrap();
        let written = ParquetReader::new(file).finish().unwrap();
        assert_eq!(
            column_to_strings(&written, "Activity").unwrap(),
            ["Create Fine", "Send Fine", "Create Fine", "Payment"]
        );
        assert!(!staging_dir(&project).exists());
    }

    #[test]
    fn an_import_replaces_the_previous_project_directory() {
        let scratch = Scratch::new("replace");
        let source = scratch.csv(FINES_CSV);
        let project = scratch.project();
        fs::create_dir_all(project.join("groups")).unwrap();
        fs::write(project.join("groups").join("Xk3PqL9a.parquet"), "old").unwrap();

        import_event_log(&project, &source, &fines_columns(), &[]).unwrap();

        assert!(project.join("event_log.parquet").exists());
        assert!(!project.join("groups").exists());
        assert!(!staging_dir(&project).exists());
        assert!(!previous_dir(&project).exists());
    }

    #[test]
    fn a_failed_import_leaves_the_previous_project_untouched() {
        let scratch = Scratch::new("failure");
        let source = scratch.csv(&FINES_CSV.replace(
            "B7,Payment,2006-09-10 14:30,C",
            "A1,Payment,2006-09-10 14:30,C",
        ));
        let columns: Vec<ColumnMapping> = serde_json::from_str(&FINES_COLUMNS.replace(
            r#""vehicleClass","role":"other","type":"string","scope":"case","caseResolution":"first""#,
            r#""vehicleClass","role":"other","type":"string","scope":"case","caseResolution":"constant""#,
        ))
        .unwrap();
        let project = scratch.project();
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("event_log.parquet"), "previous").unwrap();

        let error = import_event_log(&project, &source, &columns, &[]).unwrap_err();

        assert!(error.contains("vehicleClass"), "names the column: {error}");
        assert_eq!(
            fs::read_to_string(project.join("event_log.parquet")).unwrap(),
            "previous"
        );
        assert!(!staging_dir(&project).exists());
    }

    fn group(id: &str, filters: &str) -> GroupFilters {
        serde_json::from_str(&format!(r#"{{"id":"{id}","filters":{filters}}}"#)).unwrap()
    }

    #[test]
    fn an_import_applies_its_groups_in_order() {
        let scratch = Scratch::new("groups");
        let source = scratch.csv(FINES_CSV);
        let project = scratch.project();
        let groups = [
            group(
                "Paid0001",
                r#"[{"kind":"attribute","column":"Activity","mode":"mandatory","values":["Payment"]}]"#,
            ),
            group("All00002", "[]"),
        ];

        let result = import_event_log(&project, &source, &fines_columns(), &groups).unwrap();

        assert_eq!(result.groups.len(), 2);
        assert_eq!(result.groups[0].cases, 1);
        assert_eq!(result.groups[0].events, 2);
        assert_eq!(result.groups[1].cases, 2);
        let file = fs::File::open(project.join("groups").join("Paid0001.parquet")).unwrap();
        let written = ParquetReader::new(file).finish().unwrap();
        assert_eq!(
            column_to_strings(&written, "Case ID").unwrap(),
            ["B7", "B7"]
        );
        assert!(project.join("groups").join("All00002.parquet").exists());
        assert!(!staging_dir(&project).exists());
    }

    #[test]
    fn a_failing_group_leaves_the_previous_project_untouched() {
        let scratch = Scratch::new("group-failure");
        let source = scratch.csv(FINES_CSV);
        let project = scratch.project();
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("event_log.parquet"), "previous").unwrap();
        let groups = [group(
            "Missing1",
            r#"[{"kind":"attribute","column":"nope","mode":"mandatory","values":["x"]}]"#,
        )];

        let error = import_event_log(&project, &source, &fines_columns(), &groups).unwrap_err();

        assert!(error.contains("Missing1"), "names the Group: {error}");
        assert_eq!(
            fs::read_to_string(project.join("event_log.parquet")).unwrap(),
            "previous"
        );
        assert!(!project.join("groups").exists());
        assert!(!staging_dir(&project).exists());
    }

    #[test]
    fn a_failed_first_import_leaves_no_directory() {
        let scratch = Scratch::new("first-failure");
        let source = scratch.csv(FINES_CSV);
        let columns: Vec<ColumnMapping> = serde_json::from_str(&FINES_COLUMNS.replace(
            r#""name":"vehicleClass","role":"other","type":"string""#,
            r#""name":"vehicleClass","role":"other","type":"integer""#,
        ))
        .unwrap();
        let project = scratch.project();

        assert!(import_event_log(&project, &source, &columns, &[]).is_err());
        assert!(!project.exists());
        assert!(!staging_dir(&project).exists());
    }

    #[test]
    fn a_mapping_naming_a_column_the_file_lacks_is_refused() {
        let error = validation_error(
            &roles_mapping(["case_id", "activity_name", "complete_timestamp"]),
            &["case", "activity"],
        );
        assert_eq!(error, "Column mapping references an unknown column: end");
    }

    #[test]
    fn a_column_mapped_twice_is_refused() {
        let error = validation_error(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"event"},
              {"name":"case","role":"other","type":"string","scope":"event"}
            ]"#,
            &["case"],
        );
        assert_eq!(error, "Column \"case\" is mapped more than once.");
    }

    #[test]
    fn a_header_column_left_out_of_the_mapping_is_refused() {
        let mut names = ROLES_HEADER.to_vec();
        names.push("vehicleClass");
        let error = validation_error(
            &roles_mapping(["case_id", "activity_name", "complete_timestamp"]),
            &names,
        );
        assert_eq!(
            error,
            "Column mapping must include every column from the event log."
        );
    }

    #[test]
    fn an_empty_mapping_is_refused() {
        assert_eq!(
            validation_error("[]", &[]),
            "Column mapping must be a non-empty array."
        );
    }

    #[test]
    fn each_required_role_must_appear_exactly_once() {
        assert_eq!(
            validation_error(
                &roles_mapping(["other", "activity_name", "complete_timestamp"]),
                ROLES_HEADER
            ),
            "Exactly one column must have the case_id role."
        );
        assert_eq!(
            validation_error(
                &roles_mapping(["case_id", "case_id", "complete_timestamp"]),
                ROLES_HEADER
            ),
            "Exactly one column must have the case_id role."
        );
        assert_eq!(
            validation_error(
                &roles_mapping(["case_id", "other", "complete_timestamp"]),
                ROLES_HEADER
            ),
            "Exactly one column must have the activity_name role."
        );
        assert_eq!(
            validation_error(
                &roles_mapping(["case_id", "activity_name", "other"]),
                ROLES_HEADER
            ),
            "Exactly one column must have the complete_timestamp role."
        );
    }

    #[test]
    fn at_most_one_start_timestamp_is_allowed() {
        let error = validation_error(
            r#"[
              {"name":"case","role":"case_id","type":"string","scope":"event"},
              {"name":"activity","role":"activity_name","type":"string","scope":"event"},
              {"name":"end","role":"complete_timestamp","type":"datetime","scope":"event"},
              {"name":"s1","role":"start_timestamp","type":"datetime","scope":"event"},
              {"name":"s2","role":"start_timestamp","type":"datetime","scope":"event"}
            ]"#,
            &["case", "activity", "end", "s1", "s2"],
        );
        assert_eq!(
            error,
            "At most one column can have the start_timestamp role."
        );
    }

    #[test]
    fn a_complete_mapping_passes() {
        let columns: Vec<ColumnMapping> = serde_json::from_str(&roles_mapping([
            "case_id",
            "activity_name",
            "complete_timestamp",
        ]))
        .unwrap();
        assert!(validate_mapping(&columns, &header(ROLES_HEADER)).is_ok());
    }
}

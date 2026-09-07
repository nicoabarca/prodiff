use super::storage::{copy_original, create_project_dir, delete_project_dir, write_parquet};
use crate::column_mapping::{
    find_role, require_role, to_polars_format, ColumnMapping, ColumnRole, ColumnType,
};
use crate::parsing::{column_to_strings, read_csv};
use crate::stats::{summarize, EventLogStats};
use polars::prelude::*;
use std::collections::HashMap;

fn target_dtype(column_type: ColumnType) -> DataType {
    match column_type {
        ColumnType::String => DataType::String,
        ColumnType::Integer => DataType::Int64,
        ColumnType::Float => DataType::Float64,
        ColumnType::Boolean => DataType::Boolean,
        ColumnType::Date => DataType::Date,
        ColumnType::Datetime => DataType::Datetime(TimeUnit::Milliseconds, None),
    }
}

/// The Column Mapping's declared type is what every later query assumes the
/// column physically is, so the Event Log is written in those types, not in
/// whatever the CSV reader inferred. Without this the two silently disagree
/// whenever the user overrides a suggested type: a numeric resource id declared
/// as text stays an i64 in the file, and every filter on it fails at query time.
///
/// The cast is strict: a column that cannot be read as its declared type fails
/// the import, naming itself.
fn cast_to_declared(mut df: DataFrame, columns: &[ColumnMapping]) -> Result<DataFrame, String> {
    for mapping in columns {
        // A column named in the mapping but missing from the file is the
        // frontend's error to catch; here it is simply nothing to cast.
        let Ok(column) = df.column(&mapping.name) else {
            continue;
        };
        let target = target_dtype(mapping.column_type);
        // Timestamps keep the precision and zone the CSV parse gave them.
        // Re-casting a Datetime to the canonical unit would drop the zone.
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
                mapping.timestamp_format.as_deref(),
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
        ColumnType::Date => strings
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

#[tauri::command]
pub fn create_event_log(
    app: tauri::AppHandle,
    project_id: String,
    source_path: String,
    columns: Vec<ColumnMapping>,
) -> Result<CreateEventLogResult, String> {
    let mut df = cast_to_declared(
        read_csv(&source_path, None).map_err(|e| e.to_string())?,
        &columns,
    )?;

    // Rows can arrive out of order (multi-case CSVs are rarely pre-sorted);
    // case/activity/variant counts and any later trace analysis all assume
    // each case's events run in timestamp order, so enforce it once here.
    let case_col = require_role(&columns, ColumnRole::CaseId)?;
    let end_ts_col = require_role(&columns, ColumnRole::CompleteTimestamp)?;
    let mut sort_cols = vec![case_col, end_ts_col];
    if let Some(start_ts_col) = find_role(&columns, ColumnRole::StartTimestamp) {
        sort_cols.push(start_ts_col);
    }
    df = df
        .sort(sort_cols, SortMultipleOptions::default())
        .map_err(|e| e.to_string())?;

    let stats = summarize(&df, &columns)?;

    let dir = create_project_dir(&app, &project_id)?;
    let original_path = copy_original(&source_path, &dir)?;
    let event_log_path = write_parquet(&mut df, &dir)?;

    Ok(CreateEventLogResult {
        stats,
        original_path: original_path.to_string_lossy().into_owned(),
        event_log_path: event_log_path.to_string_lossy().into_owned(),
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

/// Counts the cases in which a column carries more than one distinct non-null
/// value. Nulls never violate on their own, and the cases need not be
/// contiguous: the frame is read as the CSV gives it.
fn case_column_violations(
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
        // Per case: the first non-null value, and the first one that disagreed.
        let mut seen: HashMap<&str, (&str, Option<&str>)> = HashMap::new();
        let mut offenders: Vec<&str> = Vec::new();
        for (case, value) in cases.iter().zip(&values) {
            if value.is_empty() {
                continue;
            }
            match seen.get_mut(case.as_str()) {
                None => {
                    seen.insert(case, (value, None));
                }
                Some((first, other)) => {
                    if value != first && other.is_none() {
                        *other = Some(value);
                        offenders.push(case);
                    }
                }
            }
        }
        if let Some(example) = offenders.first() {
            let (first, other) = seen[example];
            violations.push(CaseColumnViolation {
                column: column.clone(),
                cases: offenders.len(),
                example_case: (*example).to_string(),
                example_values: vec![
                    first.to_string(),
                    other
                        .expect("an offending case has a second value")
                        .to_string(),
                ],
            });
        }
    }
    Ok(violations)
}

/// Only the violating columns come back.
#[tauri::command]
pub fn check_case_columns(
    source_path: String,
    case_column: String,
    columns: Vec<String>,
) -> Result<Vec<CaseColumnViolation>, String> {
    if columns.is_empty() {
        return Ok(Vec::new());
    }
    let df = read_csv(&source_path, None).map_err(|e| e.to_string())?;
    case_column_violations(&df, &case_column, &columns)
}

#[tauri::command]
pub fn delete_project_files(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    delete_project_dir(&app, &project_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping(name: &str, column_type: &str) -> Vec<ColumnMapping> {
        serde_json::from_str(&format!(
            r#"[{{"name":"{name}","role":"other","type":"{column_type}"}}]"#
        ))
        .expect("mapping payload should deserialize")
    }

    fn timed_mapping(name: &str, column_type: &str, format: &str) -> Vec<ColumnMapping> {
        serde_json::from_str(&format!(
            r#"[{{"name":"{name}","role":"other","type":"{column_type}","timestampFormat":"{format}"}}]"#
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

    /// A resource id that happens to be all digits: the CSV reader infers an
    /// integer and the user re-declares it as text.
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
    fn checking_no_columns_reads_nothing() {
        assert!(
            check_case_columns("nowhere.csv".into(), "case".into(), Vec::new())
                .unwrap()
                .is_empty()
        );
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
}

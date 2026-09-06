//! Full-column timestamp inspection for the mapping step.
//!
//! The preview ships a few hundred rows, which is enough to guess a format and
//! never enough to trust one: a log that switches format at row 600_000, or carries a
//! handful of unparseable cells, looks clean in a preview. This reads every row
//! and reports what each candidate pattern makes of the column.
//!
//! The catalog arrives from the frontend rather than being duplicated here: the
//! patterns are the user's vocabulary, and the frontend is where they are
//! written, ordered and shown.

use crate::column_mapping::to_polars_format;
use crate::parsing::read_csv;
use polars::prelude::*;

/// How many of a column's values one pattern reads. `failed` counts non-null
/// values the pattern could not read, so `matched + failed` is the column's
/// non-null count for every pattern.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternCoverage {
    pub pattern: String,
    pub matched: usize,
    pub failed: usize,
}

/// A value the reported pattern could not read, and where it sits in the file.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviantValue {
    pub value: String,
    pub row: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampColumnReport {
    pub column: String,
    pub rows: usize,
    pub nulls: usize,
    /// Patterns that read every non-null value, in catalog order. More than one
    /// means the column is ambiguous and catalog order is a guess.
    pub full_coverage: Vec<String>,
    /// The pattern reading the most values; ties break by catalog order. None
    /// when the column has no non-null value or nothing read a single one.
    pub best: Option<String>,
    pub coverage: Vec<PatternCoverage>,
    /// First values `best` could not read, capped at `DEVIANT_SAMPLE`.
    pub deviants: Vec<DeviantValue>,
}

const DEVIANT_SAMPLE: usize = 5;

/// A pattern with no time tokens describes a Date; `to_datetime` refuses it,
/// so the cast has to target the type the pattern actually spells out.
fn is_date_only(pattern: &str) -> bool {
    !pattern.contains('H') && !pattern.contains('h') && !pattern.contains("mm")
}

/// Non-strict parse: a value the pattern cannot read becomes null rather than
/// failing the whole column, which is what makes counting deviants possible.
fn parsed(column: &str, pattern: &str) -> Expr {
    let options = StrptimeOptions {
        format: Some(to_polars_format(pattern).into()),
        strict: false,
        exact: true,
        cache: true,
    };
    if is_date_only(pattern) {
        col(column).str().to_date(options)
    } else {
        col(column)
            .str()
            .to_datetime(Some(TimeUnit::Microseconds), None, options, lit("raise"))
    }
}

/// Reads `path` in full and reports, for every requested column, how many rows
/// are missing and how far each catalog pattern gets. Columns the file does not
/// carry are skipped; a column that is not text has no format to infer and is
/// skipped too.
pub fn analyze(
    path: &str,
    columns: &[String],
    patterns: &[String],
) -> Result<Vec<TimestampColumnReport>, String> {
    let df = read_csv(path, None).map_err(|e| e.to_string())?;
    let rows = df.height();

    columns
        .iter()
        .filter(|name| {
            df.column(name)
                .map(|c| c.dtype() == &DataType::String)
                .unwrap_or(false)
        })
        .map(|name| analyze_column(&df, name, rows, patterns))
        .collect()
}

fn analyze_column(
    df: &DataFrame,
    name: &str,
    rows: usize,
    patterns: &[String],
) -> Result<TimestampColumnReport, String> {
    let nulls = df.column(name).map_err(|e| e.to_string())?.null_count();
    let values = rows - nulls;

    // Every pattern is one expression in a single select, so the column is
    // walked once per pattern but the patterns run in parallel.
    let counts = df
        .clone()
        .lazy()
        .select(
            patterns
                .iter()
                .enumerate()
                .map(|(i, pattern)| {
                    parsed(name, pattern)
                        .is_null()
                        .sum()
                        .alias(format!("p{i}"))
                })
                .collect::<Vec<_>>(),
        )
        .collect()
        .map_err(|e| e.to_string())?;

    let mut coverage = Vec::with_capacity(patterns.len());
    for (i, pattern) in patterns.iter().enumerate() {
        let after = counts
            .column(&format!("p{i}"))
            .map_err(|e| e.to_string())?
            .get(0)
            .map_err(|e| e.to_string())?
            .try_extract::<u32>()
            .map_err(|e| e.to_string())? as usize;
        // The cast leaves the column's own missing cells null, so only the
        // nulls it added are the pattern's failures.
        let failed = after.saturating_sub(nulls);
        coverage.push(PatternCoverage {
            pattern: pattern.clone(),
            matched: values.saturating_sub(failed),
            failed,
        });
    }

    let full_coverage: Vec<String> = coverage
        .iter()
        .filter(|c| values > 0 && c.failed == 0)
        .map(|c| c.pattern.clone())
        .collect();

    // Strictly greater, so a tie keeps the pattern that came first in the
    // catalog, which is the order the user is shown.
    let best = coverage
        .iter()
        .filter(|c| c.matched > 0)
        .fold(None::<&PatternCoverage>, |best, c| match best {
            Some(current) if current.matched >= c.matched => Some(current),
            _ => Some(c),
        })
        .map(|c| c.pattern.clone());

    let deviants = match &best {
        Some(pattern) => first_deviants(df, name, pattern)?,
        None => Vec::new(),
    };

    Ok(TimestampColumnReport {
        column: name.to_string(),
        rows,
        nulls,
        full_coverage,
        best,
        coverage,
        deviants,
    })
}

/// The first values `pattern` fails on, with their row numbers. A missing cell
/// is not a deviant: it is counted as a null and excluded here.
fn first_deviants(
    df: &DataFrame,
    name: &str,
    pattern: &str,
) -> Result<Vec<DeviantValue>, String> {
    const ROW: &str = "__row";
    let failures = df
        .clone()
        .lazy()
        .with_row_index(ROW, None)
        .filter(parsed(name, pattern).is_null().and(col(name).is_not_null()))
        .select([col(ROW), col(name)])
        .limit(DEVIANT_SAMPLE as u32)
        .collect()
        .map_err(|e| e.to_string())?;

    let indices = failures.column(ROW).map_err(|e| e.to_string())?;
    let values = failures.column(name).map_err(|e| e.to_string())?;
    (0..failures.height())
        .map(|i| {
            let row = indices
                .get(i)
                .map_err(|e| e.to_string())?
                .try_extract::<u32>()
                .map_err(|e| e.to_string())? as usize;
            let value = values
                .get(i)
                .map_err(|e| e.to_string())?
                .str_value()
                .into_owned();
            Ok(DeviantValue { value, row })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::write;

    const CATALOG: &[&str] = &[
        "YYYY-MM-DD HH:mm:ss",
        "YYYY-MM-DD",
        "DD/MM/YYYY HH:mm:ss",
        "DD/MM/YYYY",
        "MM/DD/YYYY",
    ];

    fn analyze_csv(name: &str, body: &str, columns: &[&str]) -> Vec<TimestampColumnReport> {
        let path = std::env::temp_dir().join(format!("kiara-{name}.csv"));
        write(&path, body).expect("temp file");
        let patterns: Vec<String> = CATALOG.iter().map(|p| p.to_string()).collect();
        let columns: Vec<String> = columns.iter().map(|c| c.to_string()).collect();
        analyze(path.to_str().expect("utf-8 path"), &columns, &patterns).expect("analysis")
    }

    #[test]
    fn the_most_read_pattern_wins_even_when_it_reads_only_part_of_the_column() {
        let reports = analyze_csv(
            "mixed",
            "ts\n2024-01-05 10:00:00\n2024-01-06 10:00:00\n06/01/2024 11:30:00\n",
            &["ts"],
        );
        let report = &reports[0];
        assert_eq!(report.best.as_deref(), Some("YYYY-MM-DD HH:mm:ss"));
        assert!(report.full_coverage.is_empty());
        assert_eq!(report.deviants.len(), 1);
        assert_eq!(report.deviants[0].row, 2);
        assert_eq!(report.deviants[0].value, "06/01/2024 11:30:00");
    }

    #[test]
    fn missing_cells_are_nulls_and_count_against_no_pattern() {
        let reports = analyze_csv(
            "nulls",
            "ts\n2024-01-05 10:00:00\n\n2024-01-07 09:15:00\n",
            &["ts"],
        );
        let report = &reports[0];
        assert_eq!(report.rows, 3);
        assert_eq!(report.nulls, 1);
        assert_eq!(report.full_coverage, vec!["YYYY-MM-DD HH:mm:ss"]);
        assert!(report.deviants.is_empty());
    }

    #[test]
    fn an_ambiguous_column_reports_every_pattern_that_reads_it_in_full() {
        let reports = analyze_csv("ambiguous", "ts\n05/03/2024\n06/03/2024\n", &["ts"]);
        let report = &reports[0];
        assert_eq!(report.full_coverage, vec!["DD/MM/YYYY", "MM/DD/YYYY"]);
        assert_eq!(report.best.as_deref(), Some("DD/MM/YYYY"));
    }

    #[test]
    fn a_column_nothing_reads_has_no_best_pattern() {
        let reports = analyze_csv("unreadable", "ts\nyesterday\nlast tuesday\n", &["ts"]);
        let report = &reports[0];
        assert_eq!(report.best, None);
        assert!(report.deviants.is_empty());
        assert!(report.coverage.iter().all(|c| c.matched == 0));
    }

    #[test]
    fn a_column_the_file_does_not_carry_is_skipped() {
        let reports = analyze_csv("absent", "ts\n2024-01-05 10:00:00\n", &["ts", "missing"]);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].column, "ts");
    }
}

//! Full-column timestamp inspection for the mapping step.

use crate::column_mapping::to_polars_format;
use crate::parsing::read_csv;
use polars::prelude::*;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternCoverage {
    pub pattern: String,
    pub failed: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampColumnReport {
    pub column: String,
    pub rows: usize,
    pub missing: usize,
    pub best: Option<String>,
    pub coverage: Vec<PatternCoverage>,
    pub deviants: Vec<String>,
}

const DEVIANT_SAMPLE: usize = 5;

fn is_date_only(pattern: &str) -> bool {
    !pattern.contains('H') && !pattern.contains('h') && !pattern.contains("mm")
}

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
    let strings = df
        .column(name)
        .map_err(|e| e.to_string())?
        .str()
        .map_err(|e| e.to_string())?;
    let missing = (0..strings.len())
        .map(|index| strings.get(index))
        .filter(|value| value.is_none_or(|raw| raw.trim().is_empty()))
        .count();
    let values = rows - missing;

    let counts = df
        .clone()
        .lazy()
        .select(
            patterns
                .iter()
                .enumerate()
                .map(|(i, pattern)| parsed(name, pattern).is_null().sum().alias(format!("p{i}")))
                .collect::<Vec<_>>(),
        )
        .collect()
        .map_err(|e| e.to_string())?;

    let mut coverage = Vec::with_capacity(patterns.len());
    let mut best: Option<(&str, usize)> = None;
    for (i, pattern) in patterns.iter().enumerate() {
        let after = counts
            .column(&format!("p{i}"))
            .map_err(|e| e.to_string())?
            .get(0)
            .map_err(|e| e.to_string())?
            .try_extract::<u32>()
            .map_err(|e| e.to_string())? as usize;
        let failed = after.saturating_sub(missing);
        let matched = values.saturating_sub(failed);
        if matched > best.map_or(0, |(_, count)| count) {
            best = Some((pattern, matched));
        }
        coverage.push(PatternCoverage {
            pattern: pattern.clone(),
            failed,
        });
    }

    let best = best.map(|(pattern, _)| pattern.to_string());

    let deviants = match &best {
        Some(pattern) => first_deviants(df, name, pattern)?,
        None => Vec::new(),
    };

    Ok(TimestampColumnReport {
        column: name.to_string(),
        rows,
        missing,
        best,
        coverage,
        deviants,
    })
}

fn first_deviants(df: &DataFrame, name: &str, pattern: &str) -> Result<Vec<String>, String> {
    const PARSED: &str = "__parsed";
    let checked = df
        .clone()
        .lazy()
        .select([col(name), parsed(name, pattern).alias(PARSED)])
        .collect()
        .map_err(|e| e.to_string())?;

    let values = checked
        .column(name)
        .map_err(|e| e.to_string())?
        .str()
        .map_err(|e| e.to_string())?;
    let parsed = checked.column(PARSED).map_err(|e| e.to_string())?;
    let mut deviants = Vec::with_capacity(DEVIANT_SAMPLE);
    for i in 0..checked.height() {
        let Some(raw) = values.get(i) else { continue };
        if raw.trim().is_empty() || !matches!(parsed.get(i), Ok(AnyValue::Null)) {
            continue;
        }
        deviants.push(raw.to_string());
        if deviants.len() == DEVIANT_SAMPLE {
            break;
        }
    }
    Ok(deviants)
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
        assert_eq!(report.deviants.len(), 1);
        assert_eq!(report.deviants[0], "06/01/2024 11:30:00");
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
        assert_eq!(report.missing, 1);
        assert!(report.deviants.is_empty());
    }

    #[test]
    fn catalog_order_breaks_an_ambiguous_tie() {
        let reports = analyze_csv("ambiguous", "ts\n05/03/2024\n06/03/2024\n", &["ts"]);
        let report = &reports[0];
        assert_eq!(report.best.as_deref(), Some("DD/MM/YYYY"));
    }

    #[test]
    fn a_column_nothing_reads_has_no_best_pattern() {
        let reports = analyze_csv("unreadable", "ts\nyesterday\nlast tuesday\n", &["ts"]);
        let report = &reports[0];
        assert_eq!(report.best, None);
        assert!(report.deviants.is_empty());
        assert!(report.coverage.iter().all(|c| c.failed == 2));
    }

    #[test]
    fn whitespace_only_cells_are_missing() {
        let reports = analyze_csv("whitespace", "ts\n2024-01-05 10:00:00\n   \n", &["ts"]);
        let report = &reports[0];
        assert_eq!(report.missing, 1);
        assert_eq!(report.coverage[0].failed, 0);
    }

    #[test]
    fn a_column_the_file_does_not_carry_is_skipped() {
        let reports = analyze_csv("absent", "ts\n2024-01-05 10:00:00\n", &["ts", "missing"]);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].column, "ts");
    }
}

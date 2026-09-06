use polars::prelude::*;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

const CANDIDATE_SEPARATORS: &[u8] = &[b',', b';', b'\t', b'|'];

/// Sniffs the delimiter from the header line. Many European-locale exports use
/// `;`, since comma is the decimal separator there.
fn detect_separator(path: &str) -> u8 {
    let Ok(file) = File::open(path) else {
        return b',';
    };
    let mut header = String::new();
    if BufReader::new(file).read_line(&mut header).is_err() {
        return b',';
    }
    CANDIDATE_SEPARATORS
        .iter()
        .copied()
        .max_by_key(|&sep| header.bytes().filter(|&b| b == sep).count())
        .unwrap_or(b',')
}

/// Dates are deliberately *not* parsed by the reader. The Column Mapping
/// carries a user-confirmed timestamp format for every temporal column, and
/// `cast_to_declared` is the single place a Datetime is built from it — so a
/// column whose text the reader happened to recognize would arrive already
/// converted, in a format the user never saw, and the declared one would have
/// nothing left to apply. Every column therefore enters as text.
pub(crate) fn read_csv(path: &str, n_rows: Option<usize>) -> PolarsResult<DataFrame> {
    let mut options = CsvReadOptions::default()
        // None scans every row before settling the schema. A file whose later
        // rows change shape (a numeric column that turns alphanumeric at row
        // 10_000) is typed from the whole column, not from its first 500 rows.
        .with_infer_schema_length(None)
        .with_parse_options(CsvParseOptions::default().with_separator(detect_separator(path)));
    if let Some(n) = n_rows {
        options = options.with_n_rows(Some(n));
    }
    options
        .try_into_reader_with_file_path(Some(PathBuf::from(path)))?
        .finish()
}

pub(crate) fn column_to_strings(df: &DataFrame, name: &str) -> Result<Vec<String>, String> {
    let series = df.column(name).map_err(|e| e.to_string())?;
    // AnyValue's Display impl wraps String values in literal quotes; str_value()
    // gives the raw value. Its Null variant str_value()s to the text "null",
    // which reads like real data, so missing values are surfaced as empty.
    Ok((0..series.len())
        .map(|i| match series.get(i) {
            Ok(AnyValue::Null) | Err(_) => String::new(),
            Ok(v) => v.str_value().into_owned(),
        })
        .collect())
}

/// Translates a Polars dtype into the small canonical set the app's column
/// mapping model understands (see `src/lib/column-mapping.ts` on the frontend).
/// There is no temporal arm: the reader hands every column back as text (see
/// `read_csv`), so a timestamp column is suggested as `string` and becomes a
/// Datetime only once the user declares its type and format.
pub(crate) fn dtype_label(dtype: &DataType) -> &'static str {
    match dtype {
        DataType::Boolean => "boolean",
        DataType::Int8
        | DataType::Int16
        | DataType::Int32
        | DataType::Int64
        | DataType::UInt8
        | DataType::UInt16
        | DataType::UInt32
        | DataType::UInt64 => "integer",
        DataType::Float32 | DataType::Float64 => "float",
        _ => "string",
    }
}

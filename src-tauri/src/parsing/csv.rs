use polars::prelude::*;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

const CANDIDATE_SEPARATORS: &[u8] = &[b',', b';', b'\t', b'|'];

/// Sniffs the delimiter from the header line rather than assuming comma —
/// e.g. many European-locale exports use `;` (comma is the decimal separator
/// there, so tools avoid it as a column delimiter).
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

pub(crate) fn read_csv(path: &str, n_rows: Option<usize>) -> PolarsResult<DataFrame> {
    let mut options = CsvReadOptions::default()
        .with_infer_schema_length(Some(500))
        .with_parse_options(
            CsvParseOptions::default()
                .with_try_parse_dates(true)
                .with_separator(detect_separator(path)),
        );
    if let Some(n) = n_rows {
        options = options.with_n_rows(Some(n));
    }
    options
        .try_into_reader_with_file_path(Some(PathBuf::from(path)))?
        .finish()
}

pub(crate) fn column_to_strings(df: &DataFrame, name: &str) -> Result<Vec<String>, String> {
    let series = df.column(name).map_err(|e| e.to_string())?;
    // AnyValue's Display impl wraps String values in literal quotes (it's
    // meant for debug-printing); str_value() gives the raw value instead. Its
    // Null variant str_value()s to the literal text "null", which reads like
    // real data in a preview — surface missing values as empty instead.
    Ok((0..series.len())
        .map(|i| match series.get(i) {
            Ok(AnyValue::Null) | Err(_) => String::new(),
            Ok(v) => v.str_value().into_owned()
        })
        .collect())
}

/// Translates a Polars dtype into the small canonical set the app's column
/// mapping model understands (see `src/lib/column-mapping.ts` on the frontend).
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
        DataType::Date => "date",
        DataType::Datetime(_, _) => "datetime",
        _ => "string",
    }
}

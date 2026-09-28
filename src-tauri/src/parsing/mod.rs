pub mod commands;
mod csv;
mod timestamp;

mod xes;

pub(crate) use csv::{column_to_strings, dtype_label};
pub(crate) use timestamp::{analyze, TimestampColumnReport};

/// Reads an uploaded Event Log, XES or CSV by its extension, at most `n_rows`
/// rows when given.
pub(crate) fn read_event_log(
    path: &str,
    n_rows: Option<usize>,
) -> Result<polars::prelude::DataFrame, String> {
    if xes::is_xes_path(path) {
        xes::read_xes(path, n_rows)
    } else {
        csv::read_csv(path, n_rows).map_err(|e| e.to_string())
    }
}

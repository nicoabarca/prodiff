//! The Sample Project: a bundled Event Log imported through the same importer
//! as an upload. The frontend owns its Column Mapping, its Groups and every row
//! it stores.

pub mod commands;

/// The bundled Event Log, relative to the resource directory.
pub(crate) const SAMPLE_LOG: &str = "resources/sample-project/loan-applications.csv";

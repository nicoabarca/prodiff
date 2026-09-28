//! Reads an XES file, plain or gzipped, into the one-row-per-event table the
//! importer reads a CSV into.
//!
//! Each row is one activity instance: a `complete` event paired with the
//! `start` event of the same activity (and `concept:instance`, when the log
//! carries one) that precedes it in its trace, first in first out. The start's
//! time lands in `start_timestamp`; every other value comes from the complete
//! event. An event without `lifecycle:transition` is a complete event. A start
//! never completed and every other transition (`schedule`, `suspend`, ...) are
//! dropped, and so is the `lifecycle:transition` column itself.
//!
//! Trace attributes become columns prefixed `case:`, so the case id is
//! `case:concept:name`, or the trace's position in the file (from 0) when the
//! trace has no name. Timestamps keep the wall-clock time the file writes and
//! drop its offset, as the CSV reader does.

use crate::time::millis_to_iso;
use polars::prelude::*;
use process_mining::core::event_data::case_centric::xes::{stream_xes_from_path, XESImportOptions};
use process_mining::core::event_data::case_centric::{
    Attribute, AttributeValue, Attributes, Event,
};
use std::collections::{HashMap, VecDeque};

pub(crate) const CASE_ID_COLUMN: &str = "case:concept:name";
pub(crate) const ACTIVITY_COLUMN: &str = "concept:name";
pub(crate) const START_TIMESTAMP_COLUMN: &str = "start_timestamp";
pub(crate) const COMPLETE_TIMESTAMP_COLUMN: &str = "time:timestamp";

const TRACE_PREFIX: &str = "case:";
const TRACE_NAME_KEY: &str = "concept:name";
const LIFECYCLE_KEY: &str = "lifecycle:transition";
const INSTANCE_KEY: &str = "concept:instance";

pub(crate) fn is_xes_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".xes") || lower.ends_with(".xes.gz")
}

/// Reads at most `n_rows` rows when given, all of them otherwise.
pub(crate) fn read_xes(path: &str, n_rows: Option<usize>) -> Result<DataFrame, String> {
    let options = XESImportOptions {
        sort_events_with_timestamp_key: Some(COMPLETE_TIMESTAMP_COLUMN.to_string()),
        verbose: false,
        ..Default::default()
    };
    let (mut traces, _) = stream_xes_from_path(path, options)
        .map_err(|cause| format!("The XES file cannot be read: {cause:?}"))?;

    let mut table = Table::new();
    let limit = n_rows.unwrap_or(usize::MAX);
    'traces: for (index, trace) in (&mut traces).enumerate() {
        let mut open: HashMap<(String, String), VecDeque<Option<i64>>> = HashMap::new();
        for event in &trace.events {
            let key = instance_key(event);
            match transition(event).as_deref() {
                None | Some("complete") => {
                    let start = open.get_mut(&key).and_then(VecDeque::pop_front).flatten();
                    table.push_row(index, &trace.attributes, event, start);
                    if table.rows >= limit {
                        break 'traces;
                    }
                }
                Some("start") => open
                    .entry(key)
                    .or_default()
                    .push_back(timestamp(&event.attributes)),
                Some(_) => {}
            }
        }
    }
    if let Some(cause) = traces.check_for_errors() {
        return Err(format!("The XES file cannot be read: {cause:?}"));
    }
    table.finish()
}

fn find<'a>(attributes: &'a Attributes, key: &str) -> Option<&'a Attribute> {
    attributes.iter().find(|attribute| attribute.key == key)
}

fn transition(event: &Event) -> Option<String> {
    find(&event.attributes, LIFECYCLE_KEY).map(|attribute| match &attribute.value {
        AttributeValue::String(value) => value.trim().to_ascii_lowercase(),
        other => other.to_string().to_ascii_lowercase(),
    })
}

/// Activity and `concept:instance`, the pair a start and its complete share.
fn instance_key(event: &Event) -> (String, String) {
    let text = |key| {
        find(&event.attributes, key)
            .map(|attribute| attribute.value.to_string())
            .unwrap_or_default()
    };
    (text(ACTIVITY_COLUMN), text(INSTANCE_KEY))
}

fn timestamp(attributes: &Attributes) -> Option<i64> {
    match find(attributes, COMPLETE_TIMESTAMP_COLUMN).map(|attribute| &attribute.value) {
        Some(AttributeValue::Date(date)) => Some(date.naive_local().and_utc().timestamp_millis()),
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Cell {
    Text(String),
    Int(i64),
    Float(f64),
    Bool(bool),
    Datetime(i64),
}

impl Cell {
    /// `None` for the values a flat column cannot hold: lists, containers and
    /// values the XES reader could not parse.
    fn from_value(value: &AttributeValue) -> Option<Self> {
        match value {
            AttributeValue::String(text) => Some(Self::Text(text.clone())),
            AttributeValue::Date(date) => Some(Self::Datetime(
                date.naive_local().and_utc().timestamp_millis(),
            )),
            AttributeValue::Int(value) => Some(Self::Int(*value)),
            AttributeValue::Float(value) => Some(Self::Float(*value)),
            AttributeValue::Boolean(value) => Some(Self::Bool(*value)),
            AttributeValue::ID(id) => Some(Self::Text(id.to_string())),
            AttributeValue::List(_) | AttributeValue::Container(_) | AttributeValue::None() => None,
        }
    }

    fn text(&self) -> String {
        match self {
            Self::Text(text) => text.clone(),
            Self::Int(value) => value.to_string(),
            Self::Float(value) => value.to_string(),
            Self::Bool(value) => value.to_string(),
            Self::Datetime(millis) => millis_to_iso(*millis),
        }
    }
}

/// Columns in the order they were first seen, each padded with nulls to the
/// rows written before it appeared.
struct Table {
    rows: usize,
    columns: Vec<(String, Vec<Option<Cell>>)>,
    index: HashMap<String, usize>,
}

impl Table {
    fn new() -> Self {
        let mut table = Self {
            rows: 0,
            columns: Vec::new(),
            index: HashMap::new(),
        };
        for name in [
            CASE_ID_COLUMN,
            ACTIVITY_COLUMN,
            START_TIMESTAMP_COLUMN,
            COMPLETE_TIMESTAMP_COLUMN,
        ] {
            table.column(name);
        }
        table
    }

    fn column(&mut self, name: &str) -> &mut Vec<Option<Cell>> {
        let position = match self.index.get(name) {
            Some(&position) => position,
            None => {
                self.columns.push((name.to_string(), Vec::new()));
                self.index.insert(name.to_string(), self.columns.len() - 1);
                self.columns.len() - 1
            }
        };
        &mut self.columns[position].1
    }

    /// A key repeated within one row keeps its last value.
    fn set(&mut self, name: &str, cell: Cell) {
        let row = self.rows;
        let values = self.column(name);
        if values.len() == row + 1 {
            values[row] = Some(cell);
        } else {
            values.resize(row, None);
            values.push(Some(cell));
        }
    }

    fn push_row(
        &mut self,
        trace_index: usize,
        trace_attributes: &Attributes,
        event: &Event,
        start: Option<i64>,
    ) {
        for attribute in trace_attributes {
            if let Some(cell) = Cell::from_value(&attribute.value) {
                self.set(&format!("{TRACE_PREFIX}{}", attribute.key), cell);
            }
        }
        if find(trace_attributes, TRACE_NAME_KEY).is_none() {
            self.set(CASE_ID_COLUMN, Cell::Text(trace_index.to_string()));
        }
        for attribute in &event.attributes {
            if attribute.key == LIFECYCLE_KEY {
                continue;
            }
            if let Some(cell) = Cell::from_value(&attribute.value) {
                self.set(&attribute.key, cell);
            }
        }
        if let Some(millis) = start {
            self.set(START_TIMESTAMP_COLUMN, Cell::Datetime(millis));
        }
        self.rows += 1;
    }

    /// `start_timestamp` is left out when no event paired with a start.
    fn finish(mut self) -> Result<DataFrame, String> {
        let rows = self.rows;
        let columns = std::mem::take(&mut self.columns)
            .into_iter()
            .filter(|(name, values)| {
                name != START_TIMESTAMP_COLUMN || values.iter().any(Option::is_some)
            })
            .map(|(name, mut values)| {
                values.resize(rows, None);
                build_column(&name, values)
            })
            .collect::<Result<Vec<_>, _>>()?;
        DataFrame::new(rows, columns).map_err(|e| e.to_string())
    }
}

/// Integers mixed with floats widen to floats; any other mix of kinds, and a
/// column with no value at all, is text.
fn build_column(name: &str, values: Vec<Option<Cell>>) -> Result<Column, String> {
    let present = || values.iter().flatten();
    let all = |kind: fn(&Cell) -> bool| present().next().is_some() && present().all(kind);
    let name = PlSmallStr::from(name);

    if all(|cell| matches!(cell, Cell::Int(_))) {
        let ints: Vec<Option<i64>> = values
            .iter()
            .map(|cell| match cell {
                Some(Cell::Int(value)) => Some(*value),
                _ => None,
            })
            .collect();
        return Ok(Column::new(name, ints));
    }
    if all(|cell| matches!(cell, Cell::Int(_) | Cell::Float(_))) {
        let floats: Vec<Option<f64>> = values
            .iter()
            .map(|cell| match cell {
                Some(Cell::Int(value)) => Some(*value as f64),
                Some(Cell::Float(value)) => Some(*value),
                _ => None,
            })
            .collect();
        return Ok(Column::new(name, floats));
    }
    if all(|cell| matches!(cell, Cell::Bool(_))) {
        let bools: Vec<Option<bool>> = values
            .iter()
            .map(|cell| match cell {
                Some(Cell::Bool(value)) => Some(*value),
                _ => None,
            })
            .collect();
        return Ok(Column::new(name, bools));
    }
    if all(|cell| matches!(cell, Cell::Datetime(_))) {
        let millis: Vec<Option<i64>> = values
            .iter()
            .map(|cell| match cell {
                Some(Cell::Datetime(value)) => Some(*value),
                _ => None,
            })
            .collect();
        return Column::new(name, millis)
            .cast(&DataType::Datetime(TimeUnit::Milliseconds, None))
            .map_err(|e| e.to_string());
    }
    let texts: Vec<Option<String>> = values
        .iter()
        .map(|cell| cell.as_ref().map(Cell::text))
        .collect();
    Ok(Column::new(name, texts))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsing::column_to_strings;
    use std::io::Write;
    use std::path::PathBuf;

    /// A fresh file under the system temp dir, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str, bytes: &[u8]) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("xes-{nanos}"));
            std::fs::create_dir_all(&dir).unwrap();
            let path = dir.join(name);
            std::fs::write(&path, bytes).unwrap();
            Self(path)
        }

        fn path(&self) -> &str {
            self.0.to_str().unwrap()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            if let Some(dir) = self.0.parent() {
                let _ = std::fs::remove_dir_all(dir);
            }
        }
    }

    fn log(traces: &str) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
{traces}
</log>"#
        )
    }

    fn event(activity: &str, transition: Option<&str>, time: &str, extra: &str) -> String {
        let lifecycle = transition
            .map(|t| format!(r#"<string key="lifecycle:transition" value="{t}"/>"#))
            .unwrap_or_default();
        format!(
            r#"<event><string key="concept:name" value="{activity}"/>{lifecycle}<date key="time:timestamp" value="{time}"/>{extra}</event>"#
        )
    }

    fn read(xes: &str) -> DataFrame {
        let file = Scratch::new("log.xes", xes.as_bytes());
        read_xes(file.path(), None).unwrap()
    }

    fn strings(df: &DataFrame, name: &str) -> Vec<String> {
        column_to_strings(df, name).unwrap()
    }

    fn millis(df: &DataFrame, name: &str) -> Vec<Option<i64>> {
        let cast = df.column(name).unwrap().cast(&DataType::Int64).unwrap();
        let values = cast.i64().unwrap();
        (0..values.len()).map(|i| values.get(i)).collect()
    }

    const T9: i64 = 1_710_493_200_000;
    const HOUR: i64 = 3_600_000;

    #[test]
    fn a_start_and_its_complete_make_one_row() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}</trace>"#,
            event("Review", Some("start"), "2024-03-15T09:00:00", ""),
            event("Review", Some("complete"), "2024-03-15T10:00:00", ""),
        )));

        assert_eq!(df.height(), 1);
        assert_eq!(strings(&df, CASE_ID_COLUMN), ["c1"]);
        assert_eq!(strings(&df, ACTIVITY_COLUMN), ["Review"]);
        assert_eq!(millis(&df, START_TIMESTAMP_COLUMN), [Some(T9)]);
        assert_eq!(millis(&df, COMPLETE_TIMESTAMP_COLUMN), [Some(T9 + HOUR)]);
        assert!(df.column(LIFECYCLE_KEY).is_err());
    }

    #[test]
    fn interleaved_instances_of_one_activity_pair_first_in_first_out() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}{}{}</trace>"#,
            event("Check", Some("start"), "2024-03-15T09:00:00", ""),
            event("Check", Some("start"), "2024-03-15T10:00:00", ""),
            event("Check", Some("complete"), "2024-03-15T11:00:00", ""),
            event("Check", Some("complete"), "2024-03-15T12:00:00", ""),
        )));

        assert_eq!(
            millis(&df, START_TIMESTAMP_COLUMN),
            [Some(T9), Some(T9 + HOUR)]
        );
    }

    #[test]
    fn concept_instance_decides_which_start_a_complete_closes() {
        let instance = |id: &str| format!(r#"<string key="concept:instance" value="{id}"/>"#);
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}{}{}</trace>"#,
            event(
                "Check",
                Some("start"),
                "2024-03-15T09:00:00",
                &instance("a")
            ),
            event(
                "Check",
                Some("start"),
                "2024-03-15T10:00:00",
                &instance("b")
            ),
            event(
                "Check",
                Some("complete"),
                "2024-03-15T11:00:00",
                &instance("b")
            ),
            event(
                "Check",
                Some("complete"),
                "2024-03-15T12:00:00",
                &instance("a")
            ),
        )));

        assert_eq!(
            millis(&df, START_TIMESTAMP_COLUMN),
            [Some(T9 + HOUR), Some(T9)]
        );
    }

    #[test]
    fn a_complete_without_a_start_has_no_start_timestamp() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}{}</trace>"#,
            event("Submit", None, "2024-03-15T08:00:00", ""),
            event("Review", Some("start"), "2024-03-15T09:00:00", ""),
            event("Review", Some("complete"), "2024-03-15T10:00:00", ""),
        )));

        assert_eq!(millis(&df, START_TIMESTAMP_COLUMN), [None, Some(T9)]);
    }

    #[test]
    fn unfinished_starts_and_other_transitions_are_dropped() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}{}{}</trace>"#,
            event("Review", Some("schedule"), "2024-03-15T08:00:00", ""),
            event("Review", Some("start"), "2024-03-15T09:00:00", ""),
            event("Review", Some("complete"), "2024-03-15T10:00:00", ""),
            event("Archive", Some("start"), "2024-03-15T11:00:00", ""),
        )));

        assert_eq!(strings(&df, ACTIVITY_COLUMN), ["Review"]);
    }

    #[test]
    fn a_log_without_starts_has_no_start_timestamp_column() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}</trace>"#,
            event("Submit", Some("complete"), "2024-03-15T09:00:00", ""),
        )));

        assert!(df.column(START_TIMESTAMP_COLUMN).is_err());
    }

    #[test]
    fn a_trace_without_a_name_is_named_by_its_position() {
        let df = read(&log(&format!(
            r#"<trace>{}</trace><trace>{}</trace>"#,
            event("Submit", None, "2024-03-15T09:00:00", ""),
            event("Submit", None, "2024-03-15T10:00:00", ""),
        )));

        assert_eq!(strings(&df, CASE_ID_COLUMN), ["0", "1"]);
    }

    #[test]
    fn trace_attributes_are_prefixed_and_repeated_on_every_row() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/><string key="region" value="North"/>{}{}</trace>"#,
            event("Submit", None, "2024-03-15T09:00:00", ""),
            event("Approve", None, "2024-03-15T10:00:00", ""),
        )));

        assert_eq!(strings(&df, "case:region"), ["North", "North"]);
    }

    #[test]
    fn attribute_types_become_column_types() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}</trace>"#,
            event(
                "Submit",
                None,
                "2024-03-15T09:00:00",
                r#"<int key="count" value="3"/><float key="amount" value="1.5"/><boolean key="urgent" value="true"/><int key="mixed" value="1"/>"#
            ),
            event(
                "Approve",
                None,
                "2024-03-15T10:00:00",
                r#"<float key="amount" value="2"/><float key="mixed" value="2.5"/><string key="note" value="ok"/>"#
            ),
        )));

        assert_eq!(df.column("count").unwrap().dtype(), &DataType::Int64);
        assert_eq!(df.column("amount").unwrap().dtype(), &DataType::Float64);
        assert_eq!(df.column("urgent").unwrap().dtype(), &DataType::Boolean);
        assert_eq!(df.column("mixed").unwrap().dtype(), &DataType::Float64);
        assert_eq!(strings(&df, "note"), ["", "ok"]);
        assert_eq!(strings(&df, "count"), ["3", ""]);
        assert_eq!(
            df.column(COMPLETE_TIMESTAMP_COLUMN).unwrap().dtype(),
            &DataType::Datetime(TimeUnit::Milliseconds, None)
        );
    }

    #[test]
    fn a_key_holding_text_and_numbers_is_text() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}</trace>"#,
            event(
                "A",
                None,
                "2024-03-15T09:00:00",
                r#"<int key="code" value="7"/>"#
            ),
            event(
                "B",
                None,
                "2024-03-15T10:00:00",
                r#"<string key="code" value="X"/>"#
            ),
        )));

        assert_eq!(df.column("code").unwrap().dtype(), &DataType::String);
        assert_eq!(strings(&df, "code"), ["7", "X"]);
    }

    #[test]
    fn timestamps_keep_the_wall_clock_time_and_drop_the_offset() {
        let df = read(&log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}{}</trace>"#,
            event("A", None, "2024-03-15T09:00:00.000+02:00", ""),
            event("B", None, "2024-03-15T10:00:00.000Z", ""),
        )));

        assert_eq!(
            millis(&df, COMPLETE_TIMESTAMP_COLUMN),
            [Some(T9), Some(T9 + HOUR)]
        );
    }

    #[test]
    fn a_row_limit_stops_the_read() {
        let df = {
            let xes = log(&format!(
                r#"<trace>{}{}</trace><trace>{}</trace>"#,
                event("A", None, "2024-03-15T09:00:00", ""),
                event("B", None, "2024-03-15T10:00:00", ""),
                event("C", None, "2024-03-15T11:00:00", ""),
            ));
            let file = Scratch::new("log.xes", xes.as_bytes());
            read_xes(file.path(), Some(2)).unwrap()
        };

        assert_eq!(strings(&df, ACTIVITY_COLUMN), ["A", "B"]);
    }

    #[test]
    fn a_gzipped_log_reads_like_a_plain_one() {
        let xes = log(&format!(
            r#"<trace><string key="concept:name" value="c1"/>{}</trace>"#,
            event("Submit", None, "2024-03-15T09:00:00", ""),
        ));
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(xes.as_bytes()).unwrap();
        let file = Scratch::new("log.xes.gz", &encoder.finish().unwrap());

        let df = read_xes(file.path(), None).unwrap();

        assert_eq!(strings(&df, CASE_ID_COLUMN), ["c1"]);
    }

    #[test]
    fn a_file_that_is_not_xes_fails() {
        let file = Scratch::new("log.xes", b"Case,Activity\n1,A\n");
        assert!(read_xes(file.path(), None).is_err());
    }

    #[test]
    fn xes_paths_are_recognized_by_extension() {
        assert!(is_xes_path("/logs/BPI.xes"));
        assert!(is_xes_path("/logs/BPI.XES.GZ"));
        assert!(!is_xes_path("/logs/BPI.csv"));
        assert!(!is_xes_path("/logs/BPI.csv.gz"));
    }
}

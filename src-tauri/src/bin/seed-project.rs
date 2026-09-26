//! `seed-project <project_dir> <source>`: imports one Event Log outside the app,
//! writes its Custom Attributes and applies Groups to it. Reads
//! `{ columns, customAttributes, groups }` as JSON on stdin, where each Custom
//! Attribute is `{ id, formula }` and each Group is `{ id, filters }`. Groups may
//! filter on the Custom Attributes' columns. Prints
//! `{ eventLog, customAttributes, groups }` as JSON on stdout; an error goes to
//! stderr with a non-zero exit.

use prodiff_lib::column_mapping::ColumnMapping;
use prodiff_lib::custom_attributes::{self, CustomAttribute, EmptyCount};
use prodiff_lib::event_log::importer::{import_event_log, CreateEventLogResult};
use prodiff_lib::groups::{self, GroupFilters};
use std::io::Read;
use std::path::Path;
use std::process::ExitCode;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Seed {
    columns: Vec<ColumnMapping>,
    #[serde(default)]
    custom_attributes: Vec<CustomAttribute>,
    #[serde(default)]
    groups: Vec<GroupFilters>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Seeded {
    event_log: CreateEventLogResult,
    custom_attributes: Vec<EmptyCount>,
    groups: Vec<serde_json::Value>,
}

fn read_seed() -> Result<Seed, String> {
    let mut text = String::new();
    std::io::stdin()
        .read_to_string(&mut text)
        .map_err(|e| format!("stdin: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("stdin: {e}"))
}

/// The Column Mapping with one number column per Custom Attribute, as the app
/// sends it when a Group is applied.
fn analysis_columns(seed: &Seed) -> Result<Vec<ColumnMapping>, String> {
    let mut columns = seed.columns.clone();
    for attribute in &seed.custom_attributes {
        let entry = serde_json::json!({
            "name": custom_attributes::column_name(&attribute.id),
            "role": "other",
            "scope": "event",
            "type": "float"
        });
        columns.push(serde_json::from_value(entry).map_err(|e| e.to_string())?);
    }
    Ok(columns)
}

fn seed(project_dir: &Path, source: &str, seed: Seed) -> Result<Seeded, String> {
    let imported = import_event_log(project_dir, source, &seed.columns, &[])?;
    let empty_counts = custom_attributes::update(
        project_dir,
        &seed.custom_attributes,
        &[],
        &[],
        &seed.columns,
    )?;
    let columns = analysis_columns(&seed)?;
    let stats = seed
        .groups
        .iter()
        .map(|group| {
            groups::apply(project_dir, group, &columns)
                .and_then(|stats| serde_json::to_value(stats).map_err(|e| e.to_string()))
                .map_err(|e| format!("Group {}: {e}", group.id))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Seeded {
        event_log: imported.event_log,
        custom_attributes: empty_counts,
        groups: stats,
    })
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let [_, project_dir, source] = args.as_slice() else {
        eprintln!("usage: seed-project <project_dir> <source> < seed.json");
        return ExitCode::from(2);
    };

    let seeded = read_seed()
        .and_then(|input| seed(Path::new(project_dir), source, input))
        .and_then(|result| serde_json::to_string(&result).map_err(|e| e.to_string()));
    match seeded {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

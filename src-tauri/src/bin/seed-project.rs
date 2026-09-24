//! `seed-project <project_dir> <source>`: imports one Event Log outside the app
//! and applies Groups to it. Reads `{ columns, groups }` as JSON on stdin, where
//! each Group is `{ id, filters }`. Prints `{ eventLog, groups }` as JSON on
//! stdout; an error goes to stderr with a non-zero exit.

use prodiff_lib::column_mapping::ColumnMapping;
use prodiff_lib::event_log::importer::import_event_log;
use prodiff_lib::groups::GroupFilters;
use std::io::Read;
use std::path::Path;
use std::process::ExitCode;

#[derive(serde::Deserialize)]
struct Seed {
    columns: Vec<ColumnMapping>,
    #[serde(default)]
    groups: Vec<GroupFilters>,
}

fn read_seed() -> Result<Seed, String> {
    let mut text = String::new();
    std::io::stdin()
        .read_to_string(&mut text)
        .map_err(|e| format!("stdin: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("stdin: {e}"))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let [_, project_dir, source] = args.as_slice() else {
        eprintln!("usage: seed-project <project_dir> <source> < seed.json");
        return ExitCode::from(2);
    };

    let imported = read_seed()
        .and_then(|seed| {
            import_event_log(Path::new(project_dir), source, &seed.columns, &seed.groups)
        })
        .and_then(|result| serde_json::to_string(&result).map_err(|e| e.to_string()));
    match imported {
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

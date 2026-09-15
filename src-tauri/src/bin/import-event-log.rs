//! `import-event-log <project_dir> <source> <manifest>`: imports one Event Log
//! outside the app. Prints the import result as JSON on stdout; an error goes
//! to stderr with a non-zero exit.

use std::path::Path;
use std::process::ExitCode;
use tauri_test_app_lib::column_mapping::ColumnMapping;
use tauri_test_app_lib::event_log::importer::import_event_log;

#[derive(serde::Deserialize)]
struct Manifest {
    columns: Vec<ColumnMapping>,
}

fn read_manifest(path: &str) -> Result<Manifest, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("{path}: {e}"))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let [_, project_dir, source, manifest] = args.as_slice() else {
        eprintln!("usage: import-event-log <project_dir> <source> <manifest>");
        return ExitCode::from(2);
    };

    let imported = read_manifest(manifest)
        .and_then(|m| import_event_log(Path::new(project_dir), source, &m.columns))
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

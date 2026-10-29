//! `seed-project <project_dir> <source>`: imports one Event Log outside the app,
//! writes its Custom Attributes and applies Groups to it through
//! `project_import::build`. Reads `{ columns, customAttributes, groups }` as
//! JSON on stdin, where each Custom Attribute is `{ id, scope, formula }` and each
//! Group is `{ id, filters }`. Groups may filter on the Custom Attributes'
//! columns. Prints `{ eventLog, customAttributes, groups }` as JSON on stdout;
//! an error goes to stderr with a non-zero exit.

use prodiff_lib::project_import::{self, BuildInput};
use std::io::Read;
use std::path::Path;
use std::process::ExitCode;

fn read_input() -> Result<BuildInput, String> {
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

    let seeded = read_input()
        .and_then(|input| project_import::build(Path::new(project_dir), source, &input))
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

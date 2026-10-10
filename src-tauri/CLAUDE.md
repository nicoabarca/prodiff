# src-tauri

The Rust backend. Every module under `src/` is a domain, and a domain's Tauri commands are all in its `commands.rs`, registered in `src/lib.rs`. The pipeline behind them is `mod.rs` or the file named below.

## Modules

| Module              | Holds                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parsing`           | Reading an upload before it is a Project: `csv.rs`, `xes.rs`, `timestamp.rs` and `number.rs` detection, and `draft.rs`, the Draft Parquet an XES upload is read into once. `commands.rs` also holds `off_main_thread`, which every read command runs through. |
| `column_mapping`    | The Column Mapping as one value crossing from the frontend, and `format.rs`.                                                                                                                                                                                  |
| `event_log`         | `importer.rs` is the import pipeline, upload and Column Mapping in, project directory out. `storage.rs` owns every path under `{app_data}/projects/{project_id}/`. `profile.rs` is the per-column profile.                                                    |
| `filters`           | One file per filter kind, dispatched and folded by `mod.rs` (`filters::apply`). `queries.rs` reads the Event Log, resolves `case_not_in_group` (`queries::filtered`) and holds the aggregations behind each filter command.                                   |
| `groups`            | `groups::apply` and `storage.rs`, which reads and writes `groups/{group_id}.parquet` and defines `ORIGINAL`.                                                                                                                                                  |
| `custom_attributes` | `formula.rs` parses a formula; `mod.rs` writes the `fx_{id}` column into the Event Log and every applied Group.                                                                                                                                               |
| `analysis`          | What every comparison view shares: `GroupLog`, `read_groups`, `Acc`, `Summary`, `Test`, `AttributeBlock`, `ALPHA`, `MIN_GROUP_CASES`. `stats.rs` is the Significance Test machinery: `compare`, `numeric_summary`, `benjamini_hochberg`.                      |
| `stats`             | `summarize`: the figures of one Event Log or Group (cases, events, durations) that the importer and `apply_group` return. No tests, no comparison.                                                                                                            |
| `statistics`        | The Statistics view's comparison of up to two Groups (`group_comparison`).                                                                                                                                                                                    |
| `tree`              | `mod.rs` builds the Comparison Directed Tree and the Variant rows. `distributions.rs` is the value counts behind one node's charts.                                                                                                                           |
| `dfg`               | `build.rs` aggregates; `mod.rs` shapes the payload.                                                                                                                                                                                                           |
| `sample_project`    | Imports the bundled Event Log through `event_log::importer`.                                                                                                                                                                                                  |
| `database`          | Makes room for the SQLite backup the frontend writes before a migration.                                                                                                                                                                                      |
| `time`              | Millisecond and datetime column helpers.                                                                                                                                                                                                                      |
| `bin/seed-project`  | The binary `pnpm seed` runs.                                                                                                                                                                                                                                  |

`analysis::stats`, `stats` and `statistics` are three different things: the tests, one log's figures, and a view.

## From an invoker to its command

A frontend invoker is named after its command (`tree/invokers/directed-tree.ts` calls `directed_tree`), and the command is usually in the Rust module of the same name. Four frontend domains do not line up:

- `event-log/invokers/` calls into both `parsing/commands.rs` (`preview_event_log`, `event_log_file_size`, `analyze_timestamp_columns`, `discard_event_log_draft`) and `event_log/commands.rs` (`create_event_log`, `check_case_columns`, `delete_project_files`, `column_profiles`).
- `groups/invokers/filters-impact.ts` and `group-preview.ts` call into `filters/commands.rs`.
- `distributions/invokers/node-distributions.ts` calls into `tree/commands.rs`.
- `db/invokers/prepare-database-backup.ts` calls into `database/commands.rs`.

## Tests

Unit tests sit in a `mod tests` at the bottom of the file they cover. Run them from `src-tauri/` with `cargo test`.

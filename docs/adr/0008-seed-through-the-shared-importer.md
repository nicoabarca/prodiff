# Seed Projects through the importer the app uses

Creating a Project used to have two implementations. The upload wizard sent the Column Mapping to the `create_event_log` command, which cast, validated, sorted and summarized the Event Log in Polars. The seed script was Python: it re-declared the column types for pyarrow, recomputed a subset of the statistics, skipped the constant case column check, and carried a hand-copied DDL for every table. Each time the app's import or schema changed, the seed drifted a little further from what a real Project is, and adding a second seed log meant writing more of that Python.

The import is now one function, `event_log::importer::import_event_log(project_dir, source_path, columns)`. It knows nothing about Tauri: the command resolves the app data directory and hands it a path, and a small binary, `import-event-log`, hands it a path from the command line. The importer owns the whole mapping validation against the file's real header, because a caller outside the wizard never passes through `validateColumnMapping`. It writes into a staging directory beside the Project and renames it into place, so a failed import leaves nothing behind and a repeated import replaces the previous files, Group Parquets included.

The importer does not write the Project row. ADR 0001 keeps metadata in TypeScript, and a Rust writer would have needed its own copy of the schema, which is the same drift moved to a new language. `scripts/seed.ts` runs the binary once per log and writes the row with Drizzle over `better-sqlite3`, using `schema.ts` and the `ensureSchema` sequence the app runs at startup.

Seed Project ids are derived from the log's slug, so seeding is a reset: the same slug always names the same Project, whose Groups, comparison and tree settings are deleted when it is seeded again.

**Consequence:** a seeded Project is built by exactly the code a wizard Project is, and a new seed log is a CSV and a manifest with no code. Seeding compiles the Tauri library in release once, which takes minutes on a clean checkout.

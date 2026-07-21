# Split project metadata (TS/sqlite) from event log analytics (Rust/Polars)

Project metadata (name, column mapping, hidden columns, precomputed stats) lives in sqlite, queried from the frontend in TypeScript via `@tauri-apps/plugin-sql` + Drizzle. Event Log parsing, Parquet conversion, and all Polars analytics live in Rust, invoked from the frontend via `tauri::command`s.

We considered doing everything in Rust (one backend language, one persistence layer) and doing everything in TS (Drizzle's sqlite-proxy driver talking to duckdb, or pandas). Neither fit: duckdb/Polars-equivalent tooling doesn't exist for the JS/webview side, and pandas isn't reachable from a Tauri app at all (no Python runtime). Given the developer isn't fluent in Rust yet, splitting lets CRUD-shaped metadata work stay in TS while the one thing that genuinely requires Rust (Polars) stays scoped to just that.

**Consequence:** the query boundary between TS and Rust is structured params in, computed results out — never a raw SQL/query string crossing the IPC boundary — since Polars calls are Rust method chains, not a string-based query language.

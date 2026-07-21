# Persist the mapped Event Log as Parquet; keep the raw upload alongside it

After column mapping is confirmed, the parsed event log is written once as a typed Parquet file (`{app_data}/projects/{id}/event_log.parquet`) and treated as the working copy for all analysis — never re-derived from the raw upload at query time. The original uploaded CSV is kept alongside it in the same per-project directory rather than deleted.

Alternative considered: re-parse the raw CSV/XES on every cold load (app restart). Rejected because parsing cost (and, for XES, the parse step itself) would repeat on every restart for no benefit, when the mapping step already produces the parsed result once. Alternative considered: delete the raw file after conversion to avoid double storage. Rejected because it forecloses re-running column mapping without asking the user to re-upload, and removes a fallback if a future Parquet conversion bug is discovered.

**Consequence:** each project's on-disk footprint is roughly the size of the original file plus its Parquet encoding (typically smaller than the original due to columnar compression). Hidden columns are enforced by a metadata flag read at query time, not by omitting them from the Parquet file — so un-hiding never requires re-parsing either.

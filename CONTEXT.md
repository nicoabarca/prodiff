# Procept

A local-first process mining desktop app (Tauri). Users upload event logs, the app derives process maps, variants, statistics, and a data table from them. All data stays on-device.

## Language

**Project**:
A user-created workspace wrapping one uploaded event log — its metadata (name, upload date, column mapping, hidden columns) plus the parsed, typed data derived from it.
_Avoid_: Workspace, analysis

**Event Log**:
The parsed, typed, tabular representation of a Project's uploaded file (CSV/XES), persisted as Parquet after column mapping is confirmed. One per Project. Never re-derived from the raw upload after creation.
_Avoid_: Dataset, file, upload

**Column Mapping**:
The user-confirmed correspondence between an uploaded file's raw columns and the fields process mining requires (case ID, activity, timestamp). Captured once, at project creation, before the Event Log is persisted. Every column of the file appears in it; those with no process-mining meaning carry the role `other`.

**Project Draft**:
An uploaded file that has been chosen but whose Column Mapping is not yet confirmed. It has no Project and no Event Log — abandoning the flow leaves nothing behind.
_Avoid_: Pending upload, staged file

**Hidden Column**:
A column in an Event Log the user has excluded from all analysis — filtering, statistics, process map derivation — not merely from display. Distinct from a column that's simply not shown; a hidden column is inert until un-hidden.
_Avoid_: Excluded column, disabled column

# compare

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

**Filter**:
One condition narrowing an Event Log, applied after the Event Log exists rather than at creation. Every filter is an event-level predicate lifted to whole cases; its `mode` picks the lift — `mandatory` keeps cases with a matching event, `forbidden` drops them, `keep_selected`/`trim` keeps only the matching events so surviving cases carry a sub-sequence of their original trace. Filters are never destructive: they are stored as a definition and re-evaluated on demand, never materialized.
_Avoid_: Query, condition, rule

**Slice**:
A named, ordered chain of Filters over a Project's Event Log, and the population it produces. A chain is an AND pipeline — each Filter applies to the previous one's output, so order is user-visible and matters. Slices are the unit later compared against each other.
_Avoid_: Segment, cohort, subset, view

**Base**:
The one Slice per Project (`kind: base`) whose chain applies to every other Slice — the shared cleanup applied before any comparison. Every other Slice's effective chain is the Base chain followed by its own. Created lazily on first use, so an unfiltered Project has no Slice rows at all.
_Avoid_: Root slice, default filter

**Population**:
A set of cases the Statistics view puts in one column: the whole log (no chain), the Base, or a Slice. The whole log is a Population but not a Slice — it has no chain and is never stored.
_Avoid_: Group, set

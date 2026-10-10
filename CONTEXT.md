# ProDiff

A local-first process mining desktop app (Tauri). Users upload event logs, the app derives process maps, variants, statistics, and a data table from them. All data stays on-device.

## Language

**Project**:
A user-created workspace wrapping one uploaded event log — its metadata (name, upload date, column mapping, hidden columns) plus the parsed, typed data derived from it.
_Avoid_: Workspace, analysis

**Sample Project**:
The Project the app ships with: a synthetic loan application Event Log with Groups already defined and a Comparison already chosen, so every view has something to show the first time it opens. It is created on request, never on its own, and is an ordinary Project once it exists. Creating it again replaces it.
_Avoid_: Toy log, demo project, example project

**Tour**:
A short guided walk through one view of the Sample Project that highlights one element at a time. One Tour per view; each ends by pointing at the next view.
_Avoid_: Tutorial, onboarding, walkthrough

**Event Log**:
The parsed, typed, tabular representation of a Project's uploaded file (CSV/XES), persisted as Parquet after column mapping is confirmed. One per Project. Never re-derived from the raw upload after creation.
_Avoid_: Dataset, file, upload

**Column Mapping**:
The user-confirmed correspondence between an uploaded file's raw columns and the fields process mining requires (case ID, activity, timestamp). Captured once, at project creation, before the Event Log is persisted. Every column of the file appears in it; those with no process-mining meaning carry the role `other`.

**Project Draft**:
An uploaded file that has been chosen but whose Column Mapping is not yet confirmed. It has no Project and no Event Log — abandoning the flow leaves nothing behind. An XES Project Draft is read once into a Draft Parquet, which is discarded with the draft.
_Avoid_: Pending upload, staged file

**Draft Parquet**:
An XES upload converted to Parquet the first time its Project Draft reads it, so the mapping step and the import read it without parsing XML again. It is keyed by the upload's path, size and modification time, lives under `{app_data}/drafts/`, and never outlives the app session. A CSV Project Draft has none.
_Avoid_: Cache, staged file

**Activity Instance**:
One row of an Event Log read from XES: a `complete` event paired with the `start` event of the same activity (and `concept:instance`) before it in its trace, so the row carries both a start and a complete timestamp.
_Avoid_: Paired event, interval

**Hidden Column**:
A column in an Event Log the user has excluded from all analysis — filtering, statistics, process map derivation — not merely from display. Distinct from a column that's simply not shown; a hidden column is inert until un-hidden.
_Avoid_: Excluded column, disabled column

**Custom Attribute**:
A user-named formula over the Event Log's visible number columns, computed for every event and written into the Event Log's Parquet as one more column, so every view, Filter and Group can read it like a column of the uploaded file. It is identified by its id, never its name: the column is `fx_{id}`, so renaming it rewrites nothing. A formula reads raw columns only, never another Custom Attribute, and a column a formula reads cannot be hidden or retyped. Edits are drafts until Apply, which writes the column into the Event Log and into every applied Group's Parquet.
_Avoid_: Computed column, derived field, metric, formula column

**Filter**:
One condition narrowing an Event Log, applied after the Event Log exists rather than at creation. Every filter is an event-level predicate lifted to whole cases; its `mode` picks the lift — `mandatory` keeps cases with a matching event, `forbidden` drops them, `keep_selected`/`trim` keeps only the matching events so surviving cases carry a sub-sequence of their original trace. A Filter is a definition, never a destructive edit of the Event Log.
_Avoid_: Query, condition, rule

**Filter List**:
An ordered list of Filters that, applied in order to an Event Log, produces a Group. Each Filter applies to the previous one's output, so the list is an AND pipeline and its order is user-visible and matters. A Filter List is the recipe, never the result: it is what *creates* a Group, and is not the Group itself.
_Avoid_: Filter chain, chain, query

**Group**:
A named set of cases produced by applying one Filter List to an Event Log. A Project has zero to N Groups. Each carries a user-chosen name and colour, and is a unit that can enter a Comparison. The Original is a Group too — the one whose Filter List is empty.
_Avoid_: Slice, subset, segment, cohort, population

**Original**:
The Group of the whole, unfiltered Event Log — the one Group with an empty Filter List. Named "Event Log" everywhere the user can see it; "Original" is the internal name only. Every Project has exactly one, and it exists before any other Group does.
_Avoid_: Raw, base, unfiltered log

**Comparison**:
Two or more Groups selected to be measured against each other. Groups may overlap: a case belonging to both sides is counted on both, and the count of such cases is reported when the Comparison is chosen so the reader knows the sides are not independent. A Comparison of one Group is a description rather than a comparison, and carries no Significance Test. The model admits N Groups; a given release may cap what the interface offers.
_Avoid_: A/B, versus

**Saved Comparison**:
A Comparison a Project keeps so it can be compared again in one click. It is an ordered list of one or two Groups and nothing else: it has no name of its own and reads as its Groups' names. The one whose Groups are the ones being compared is in use; that is read off the Comparison, never stored. Deleting a Saved Comparison changes nothing about what is compared, and deleting a Group deletes every Saved Comparison naming it.
_Avoid_: Preset, favourite, bookmark

**Difference Group**:
A Group created from another Group's Filter List plus one Filter excluding the cases of a second Group, so the two no longer overlap. Offered when a Comparison reports shared cases. It is an ordinary Group once created, and depends on the Group it excludes: deleting that one deletes this one too.
_Avoid_: Complement, exclusive group, negation

**Distribution**:
The counts of one attribute's values over a chosen set of a node's events, split by Group — one bar per value for a categorical attribute, one bar per bin for a numeric one. A Distribution describes a shape; it never compares two Groups the way a Significance Test does, so it carries no p-value and no Effect Direction.
_Avoid_: Histogram (that is the drawing, not the numbers), breakdown

**Distribution Scope**:
Which of a node's cases' events a Distribution counts. `At this step` counts the single event at that node's own position in the trace; `Whole case` counts every event of those same cases, at every position. The set of cases is identical either way — only which of their events are counted changes. Undefined at the Start root under `At this step`, which has no event.
_Avoid_: Variant scope — a node other than a leaf sits on many Variants, so "the Variant" names nothing there

**Directly-Follows Graph**:
A graph over an Event Log's activities, one node per activity and one edge per observed activity-to-activity transition, built from the compared Groups' Parquet files. Unlike the tree it has no root and no Variants: a case contributes every one of its transitions, so a node appears once no matter how many traces reach it. Simplification thresholds and layout are the frontend's and never re-run the command.
_Avoid_: Process map, flow chart, DFG in user-facing copy (spell it out)

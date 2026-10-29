# Case-Level Custom Attributes

*   **Author:** Nicolás Abarca
*   **Status:** Proposed
*   **Date:** 2026-10-28

--------------------------------------------------------------------------------

## Overview

A Custom Attribute is a formula the user names, such as `[expense] / [points]`. Today it is computed row by row, one value per event, and written into the Event Log's Parquet as the Float64 column `fx_{id}`. The Event Log is the source every Group is filtered from. Every view, Filter and Group then reads it like a column of the uploaded file.

This design adds a second kind: the **Case Attribute**. It is one number per case, built from the case's own data. For example, `sum([cost]) / duration()` is a case's total cost per unit of its duration. When the user creates a Custom Attribute, they pick its scope, Event or Case, and the scope cannot change later. A Case Attribute is computed once per case on the Event Log, then copied into every Group by case id. Because the value is the same on every row of the case, the tree, statistics and Filters treat it as a case-level attribute, alongside the case-scoped columns of the uploaded file.

## The Problem

Process analysts compare two Groups of cases. Many of the questions they ask are about whole cases, not single events:

*   What is a case's total cost per day of duration?
*   What is the average cost of its events?

The app cannot answer these today.

*   **Formulas are row-wise only.** A formula reads one event's own row, so it cannot sum, average or count across a case's events.
*   **Every result is treated as an event value.** The synthetic Column Mapping entry is hard-coded as `scope: "event"` (`src/lib/custom-attributes/state/custom-attributes.svelte.ts:49`). Even a formula over case-scoped columns, which is constant within a case, is shown as Node Aggregates weighted by event count. It should appear as one value per case in each Group's case-level block.
*   **Case duration is not a column.** It is the last timestamp minus the first. No formula can read it.

The workaround is to compute the value outside the app and re-import the Event Log with an extra case column. That loses the Project's Groups, Filters and settings.

ADR 0012 anticipated this. Its "Cost accepted" paragraph says that case aggregates would give a different value on a Group whose Filter List trimmed events, and that the difference "has to be decided, not inherited". This design decides it:

*   **A Case Attribute describes the whole case,** as it appears in the Event Log.
*   **A Group never recomputes it from its own rows.** It takes the value from the Event Log.

That is how an imported case-scoped column with `constant` resolution already behaves.

## Goals

*   **Scope picker.** The user chooses Event or Case when creating a Custom Attribute. The choice is stored and cannot be changed afterwards.
*   **Event scope computes exactly as today, over event-scoped columns only.** An Event formula that reads a case-scoped column is now refused. No migration handles existing mixed formulas: the app has no users yet.
*   **Case formulas** may combine:
    *   numbers and `+ - * /`;
    *   case-scoped number columns of the uploaded file;
    *   per-case aggregates of event-scoped number columns: `sum`, `mean`, `median`, `min`, `max`, `first`, `last`;
    *   `count()`, the number of events in the case;
    *   `duration()`, the case's last timestamp minus its first, in days.
*   **Refused formulas.** A formula that mixes event and case operands is refused, with a message that says how to fix it. So is a text operand.
*   **One value per case.** A Case Attribute is computed once per case on the Event Log and written as `fx_{id}` into the Event Log. Every applied Group then receives it by case id, so a case carries the same value in the Event Log and in every Group.
*   **Views treat it as a case attribute.** Its Column Mapping entry is `{ scope: "case", caseResolution: "constant" }`, so the tree, statistics and distributions show it per case, like an imported case-scoped column.
*   **Filters read it in list order.** Groups whose Filter List reads an edited Case Attribute run their Filter List again, in dependency order. This is the mechanism event attributes already use.
*   **Trimmed Groups say so.** A Group whose Filter List keeps only some events of a case (attribute `keep_selected` or timeframe `trim`) shows a note: Case Attributes are computed on whole cases.
*   **Empty values follow today's rule.** A value that cannot be computed is empty and is skipped by the views. Apply reports how many cases are empty.

## Non-Goals

*   **Values computed only over the events a Group kept.** A trimmed Group carries the whole-case value.
*   **Text operands, or formulas that relate a text attribute to a number,** such as executor vs duration.
*   **Mixing event and case operands in one formula,** such as `[cost] / [case_budget]` per event.
*   **Aggregates over expressions,** such as `sum([cost] * [qty])`. Each aggregate takes a single column.
*   **A formula reading another Custom Attribute,** of either scope.
*   **Changing an attribute's scope after creation.**
*   **Case Attributes computed per Group or applied to chosen Groups only.**

## Open Questions

None. `count()` counts the events in the case and takes no column (decided during drafting).

## Critical User Journeys (CUJs)

### CUJ 1: Cost per day of duration, compared across two Groups

*   **Given**: a Project whose Event Log has an event-scoped number column `cost`, and two applied Groups, "Fast track" and "Standard".
*   **When**:
    1.  The user creates a Custom Attribute named "Cost per day" with scope Case and formula `sum([cost]) / duration()`, then Applies.
    2.  The user compares the two Groups in the tree.
*   **Then**:
    *   Each Group's case-level block shows the distribution of "Cost per day", one value per case, with its Significance Test.
    *   A case appearing in both the Event Log and a Group has the same value in both.
    *   Single-event cases have a duration of 0. Their value is empty, they are counted in the Apply message, and the views skip them.

### CUJ 2: A Group defined by a Case Attribute

*   **Given**: the "Cost per day" Case Attribute exists.
*   **When**:
    1.  The user creates a Group with a numeric Filter "Cost per day above 500" and Applies it.
    2.  Later, the user edits the formula to `sum([cost]) / duration() * 7` and Applies the edit.
*   **Then**:
    *   The Group first holds the cases whose whole-case value is above 500.
    *   After the edit, its Filter List runs again, with every Group that excludes it re-run in dependency order. The Group's cases follow the new values.

### CUJ 3: A trimmed Group

*   **Given**: a Group whose Filter List keeps only events of activity "Review" (`keep_selected`).
*   **When**: the user views "Cost per day" for that Group.
*   **Then**:
    *   The value is the whole case's cost per day, not the cost of the "Review" events.
    *   The Group shows a note that Case Attributes are computed on whole cases.

### CUJ 4: A refused formula

*   **Given**: the attribute editor, with scope Case.
*   **When**: the user types `[cost] / duration()`, where `cost` is event-scoped.
*   **Then**:
    *   The editor refuses the formula and highlights `[cost]`.
    *   The message says `[cost]` is an event column, and suggests wrapping it, as in `sum([cost])`, or switching the scope to Event.


## Technical Plan (Architecture)

### Facts this plan relies on

Each claim was checked against the code by the review.

*   **The case id column identifies a case.** The case id column defines what a case is, so joining on it is exact.
    *   Rows whose case id is null never match in a join, so they get an empty value.
*   **Event Log row order.** At import, the Event Log is sorted by case, then complete timestamp, then start timestamp when one exists (`src-tauri/src/event_log/importer.rs:324-331`).
    *   The sort uses Polars' default options, so the order of rows that tie on every key is not defined.
*   **Group files keep the Event Log's row order.** `groups::apply` reads the Event Log, runs a sequence of lazy `.filter` calls, and writes the result (`src-tauri/src/groups/mod.rs:28-30`, `src-tauri/src/filters/mod.rs:76-89`). No Filter sorts.
    *   The tree, statistics and distributions rely on this order. They read each case as one contiguous run of rows (`tree/mod.rs:201-205`, `statistics/mod.rs:261-271`).
*   **Timestamp roles are fixed after import.** `columns-editor.svelte` locks every column whose role is not `other`. A formula can therefore read the `complete_timestamp` role column without a guard.
*   **The Duration Filter measures days.** It reads the `complete_timestamp` column through `timestamp_millis`, casts it to Int64 milliseconds and divides by `86_400_000.0` (`src-tauri/src/filters/duration.rs:18-22`).
*   **Groups are re-applied after an Apply.** The route calls `reapplyGroupsReading(project, column)` (`src/routes/app/projects/[id]/custom-attributes/+page.svelte:33`, defined at `src/lib/groups/state/groups.svelte.ts:169-204`). It re-applies every applied Group whose Filter List reads the column, and every Group that excludes one of those, in dependency order.
    *   It is keyed on the column name only, so it works for Case Attributes unchanged.
    *   A re-applied Group is re-filtered from the Event Log, so it receives the whole-case values from there.
*   **Apply blocks the project while it runs.** `applying-overlay.svelte` covers the whole project while files are rewritten, so no view and no Group Apply can run during it.
    *   This design relies on that single-writer rule rather than adding a lock.
*   **Nothing rebuilds the Event Log from `original.{ext}`.** The importer writes the Event Log once (`importer.rs:268`). No code path rebuilds Parquet files from the raw upload, so no path drops Case Attribute columns.

### Data flow on Apply

```text
 Frontend                                   Rust: custom_attributes::update
 --------                                   -------------------------------
 parse + validate (TS, owns messages)       validate each attribute by its scope
 RequestCustomAttribute { id, scope,        (safety net: catches frontend bugs)
   formula } ───────────────────────────►          │
                                                   ▼
                                            read Event Log once
                                                   │
                                     case attributes in `set`?
                                                   │ yes
                                                   ▼
                                  lookup = Event Log
                                    .group_by_stable([case_id])
                                    .agg([case expr for each attribute])
                                  one row per case: case_id, fx_{id}, …
                                  empty counts = null counts of lookup
                                                   │
               ┌───────────── stage every file on its own thread ─────────────┐
               │ 1. drop every id in `remove` and every case id in `set`      │
               │ 2. with_columns(event attribute exprs)   (row-wise, today)   │
               │ 3. left join lookup on case_id, keeping left row order;      │
               │    error if the row count changed                            │
               │ Event Log reuses the frame already read; Groups read theirs  │
               └──────────────────────────────────────────────────────────────┘
                                                   │ every staged file written?
                                                   ▼
                                  rename Groups, then the Event Log last
                                  return empty counts per attribute
 frontend: patch emptyCount ──► reapplyGroupsReading(fx_{id})
```

### Contracts

*   **Every attribute carries its scope.** Each attribute in the `update_custom_attributes` request carries a scope, `"event"` or `"case"`, and `custom_attribute_impact` receives one too. One request may mix scopes.
    *   An old payload with no scope reads as `"event"`.
    *   The type is named `AttributeScope`, so it is not confused with the Column Mapping's column scope.
*   **The `Formula` tree gains three nodes,** in the TypeScript union and the Rust enum alike. Stored event formulas still deserialize, because no existing node changes:

```text
{ kind: "aggregate", fn: AggregateFunction, column: string }
{ kind: "count" }
{ kind: "duration" }
AggregateFunction = "sum" | "mean" | "median" | "min" | "max" | "first" | "last"
```

*   **`count()` and `duration()` have no column,** so every `aggregate` node always has one.
*   **Validating and compiling a formula takes its scope,** plus the case id and `complete_timestamp` column names read from the Column Mapping.
    *   A formula reports two column sets: its **operands** (the columns the user wrote, used by the guards), and the **columns to read** (the operands, plus the case id and timestamp columns that case scope needs).
    *   Event scope compiles to a row-wise expression. Case scope compiles to an aggregation evaluated per case.

### Validation rules, one table for both sides

| Node | Event scope | Case scope |
|---|---|---|
| `number`, `negate`, `binary` | allowed | allowed |
| `column [x]` | `x` visible, role `other`, number type, column scope `event` | `x` visible, role `other`, number type, column scope `case` |
| `aggregate fn([x])` | refused: "fn() is only available for Case attributes" | `x` visible, role `other`, number type, column scope `event` |
| `count()`, `duration()` | refused | allowed |

*   **The TypeScript validator owns every user-facing message and the highlight.** It returns the source span of the operand that caused the error, using the parser's existing span type.
*   **Rust repeats the same checks as a safety net against frontend bugs,** not against a hostile caller. The frontend also supplies the Column Mapping, so Rust cannot verify more than this.
*   **Shared test vectors keep the two validators from drifting.** One JSON fixture, `src-tauri/tests/fixtures/formula-validation.json`, holds rows of formula, scope, columns and expected result (ok, or the name of the refused operand). Both the Vitest and the Rust test suites run every row.

### Case expressions

The case expression for each attribute runs inside one `group_by_stable([case_id]).agg(...)` over the Event Log. A single grouping pass computes every Case Attribute in the set.

*   Every column is cast to Float64 before any aggregate. `min`, `max`, `first` and `last` on integer columns would otherwise return integers.

| Node | Aggregation expression |
|---|---|
| `column [x]`, resolution `constant` or `first` | `x.first()`: the case's first row, exactly the row `resolved_row` reads (`tree/mod.rs:201-205`) |
| `column [x]`, resolution `last` | `x.last()`: the case's last row, again what `resolved_row` reads |
| `sum([x])` | `when(x.count() > 0).then(x.sum()).otherwise(null)`. Polars `count` excludes nulls; a case with no non-empty `x` is empty instead of 0. |
| `mean`, `median`, `min`, `max` | the Polars aggregate, which skips nulls and gives null when the case has no non-empty value |
| `first([x])`, `last([x])` | `x.drop_nulls().first()` / `.last()`: the first or last non-empty value in row order |
| `count()` | `len()`: the number of rows of the case, which is its number of events |
| `duration()` | `(ts.max() - ts.min()) / 86_400_000.0`, where `ts` is the `complete_timestamp` column cast with `timestamp_millis` to Int64 milliseconds; null timestamps are skipped |

Two behaviours differ on purpose, and the editor's function list states both:

*   **A `column` operand reads the edge row, even when that row is empty,** the same row as the tree's case blocks. **`first()`/`last()` aggregates skip empty values.**
*   **`duration()` uses the earliest and latest timestamps, not the edge rows,** so null timestamps cannot shorten a case. On whole cases it equals the Duration Filter's value. A Duration Filter placed after a trimming Filter measures the trimmed case, so in a trimmed Group the two can differ. This is the mismatch the trimmed-Group note covers.

The existing finite guard wraps the whole aggregation result: a division by zero or any other non-finite value becomes null. A formula that is only `duration()` gives 0, not empty, for a single-event case. `sum([cost]) / duration()` gives empty for that case.

Ties: rows that tie on case, complete timestamp and start timestamp have an undefined order. The tree's `first`/`last` column reads share the same order, so within one file a formula and the views always agree.

`custom_attributes` gains one new dependency: the timestamp conversion in `filters::predicates`. `custom_attributes` sits above `filters`, so the dependency still points downward.

### Writing the files

`update(project_dir, set, remove, group_ids, columns)` keeps its signature. Inside it:

1.  **Validate.** It validates every attribute against its own scope. Then it resolves `FormulaContext`, but only when `set` contains a Case Attribute.
2.  **Read and build the lookup.** It reads the Event Log once. If `set` has Case Attributes, it builds the **lookup**: `group_by_stable([case_id]).agg(case exprs, aliased fx_{id})`, which gives one row per case.
3.  **Count empties.** Each Case Attribute's empty count is the null count of its lookup column, so it counts cases. Each event attribute's empty count is the null count of its column on the rewritten Event Log, so it counts events, as today.
4.  **Stage each file on its own thread,** as today. The Event Log thread receives the frame already read; each Group thread reads its own file. For each frame:
    *   drop every id in `remove` and every Case Attribute id in `set`, so an edited column is replaced and never doubled as `fx_x_right`;
    *   add the event attribute expressions row-wise, as today;
    *   if there is a lookup, left join it on the case id column, keeping the left frame's row order, and return an error if the row count changed;
    *   write the staged sibling.
5.  **Rename.** Once every staged file is written, rename the Group files first and the Event Log last. A failure before the renames removes every staged file, as today.

A crash between renames leaves some files new and some old. Apply already writes `emptyCount = null` before calling Rust (`custom-attributes.svelte.ts:154`), so after a crash the attribute shows as not applied. Applying it again rewrites every file from the Event Log, which repairs the mix and runs `reapplyGroupsReading` again. Leftover `.staged` files are overwritten by the next Apply.

`impact(project_dir, scope, formula, columns)`:
*   reads `formula.columns(ctx)`;
*   for event scope, works as today;
*   for case scope, builds the lookup for the one formula, with `total` set to the lookup's height (cases) and `empty` set to its null count.

`Impact.events` is renamed `total`, in Rust (`mod.rs:38-41`) and in `ResponseCustomAttributeImpact`.

### Storage and Column Mapping

*   **SQLite.** `custom_attributes` gains `scope text not null default 'event'` in migration 0005, generated with `pnpm db:generate`. Existing rows read as `event`. Nothing ever updates the column after insert.
*   **Parquet.** A Case Attribute is the Float64 column `fx_{id}` in the Event Log and in every applied Group, with the same value on every row of a case.
*   **Column Mapping.** `analysisColumns` (`custom-attributes.svelte.ts:43-53`) looks up each applied attribute's scope and emits:

```text
event: { name: "fx_{id}", role: "other", type: "float", scope: "event" }
case:  { name: "fx_{id}", role: "other", type: "float", scope: "case", caseResolution: "constant" }
```

*   **Where the `case` entry is read:**
    *   The tree routes it to its case blocks (`tree/mod.rs:191-193, 651-687`). Statistics reads it once per case (`statistics/mod.rs:384-386`), and so do distributions (`distributions.rs:239-247`). None of these Rust paths change.
    *   **The DFG skips case-scoped columns** (`dfg/build.rs:80-82`), so a Case Attribute cannot be selected in the DFG, like any imported case column.

### Guards

*   **Hiding and retyping.** `readersByColumn` uses `operands()`, so it also follows `aggregate` arguments. Hiding or retyping a column that a Case Attribute aggregates is refused, as for event formulas.
*   **Scope and resolution, which is new work.**
    *   Today the scope and case-resolution selects in `columns-editor.svelte:155,173` are disabled only for role columns.
    *   They are also disabled for a column that any formula reads, applied or draft, because a column's scope decides which scope of formula may read it.
    *   For a column read directly by a Case Attribute, the case-resolution select is disabled too, because it decides which row the value comes from.
    *   The message names the formulas, like today's message for hiding and retyping.
*   **Deleting a Case Attribute** follows today's rule: it is refused while a Filter List reads its column.

### Trimmed Groups

*   **One function decides whether a Group is trimmed.** `isTrimmed(filters)` in `src/lib/groups/utils/trimmed.ts` returns true when the applied Filter List contains an attribute Filter in `keep_selected` mode or a timeframe Filter in `trim` mode. These are the only two modes that keep a case while removing some of its events (`filters/attribute.rs:18`, `filters/timeframe.rs:23`). It reads only the applied Filter List, never a draft.
*   **`original` is never trimmed.** `case_not_in_group` removes whole cases, so it does not count.
*   **Where the note shows.** When the tree's case block or the statistics attributes pane shows a Case Attribute, every trimmed Group among the compared ones shows "Case attributes are computed on whole cases". The note is per Group. The Significance Test compares whole-case values on both sides, so the test itself stays consistent.

## Alternatives Considered

### Alternative A: Case Attributes applied to chosen Groups, computed on each Group's own rows

The user picks which Groups an attribute applies to. Each target Group computes the value on the rows its Filter List kept, so a trimmed Group gets values over the events it kept. A SQLite link table records the targets. A Group rebuild runs its Filters in two stages: Filters that do not read Case Attributes, then attribute computation, then the numeric Filters that read them.

*   **Pros**:
    *   A trimmed Group's values describe the events it shows, so they agree with the Group's own duration figures.
*   **Cons**:
    *   **The default comparison offers nothing.** The Original has no file of its own, so it could never be a target, and Original vs a filtered Group would offer no Case Attribute.
    *   **The same name gives different values** for the same case in different Groups. A comparison between a trimmed and an untrimmed Group mixes the two.
    *   **The Filter List stops running in the order shown.** Filters reading Case Attributes always run last, which contradicts the definition of a Filter List in CONTEXT.md. `filters_impact`, `duration_histogram`, `daily_case_load` and `group_preview` would all need the two-stage pipeline.
    *   **It needs new machinery:**
        *   a link table;
        *   a rule to rebuild Groups on every formula edit;
        *   guards on unlinking a target;
        *   a "both Groups have it" rule for comparison pickers and saved view settings;
        *   a Rust module cycle (`groups` ↔ `custom_attributes`) to break.
*   **Reason for Rejection**: The motivating examples, such as cost per day of duration, describe a case, not the slice of it a Group kept. Version 1 does not need the extra state and the broken Filter order.

### Alternative B: Extend today's Apply to compute case aggregates on every file's own rows

Keep `update()` as it is and evaluate the case expression with `.over(case)` separately on the Event Log and on each Group file.

*   **Pros**:
    *   It is the smallest change: no lookup and no join, with the same code path for both scopes.
    *   Every file has every attribute.
*   **Cons**:
    *   **Trimmed Groups get partial values.** Their values are computed over the kept events.
    *   **Filters and stored values disagree.** A numeric Filter on the attribute selects cases by the whole-case value, because it runs on the Event Log. The stored Group value is the partial one. A Group can keep a case for a cost above 100 and then show that case's cost as 40.
*   **Reason for Rejection**: It mixes two meanings in one column. ADR 0012 named this exact difference as one that "has to be decided, not inherited".

### Alternative C: Re-run every Group's Filter List instead of joining the lookup

After writing the column into the Event Log, re-apply every applied Group from the new Event Log, instead of joining the per-case values into the existing Group files.

*   **Pros**:
    *   **One code path.** A Group file is only ever produced by `groups::apply`.
    *   **Membership changes are always applied.**
*   **Cons**:
    *   **It is slow.** It runs every Group's whole Filter List on every Apply, although only Groups whose Filter List reads the attribute can change membership.
    *   **It moves file writing outside the atomic step.** Group Apply happens one Group at a time from the frontend, outside the staged write-then-rename sequence, so a failure leaves some Groups rebuilt and others not.
*   **Reason for Rejection**: The join gives the same values for Groups whose Filter List does not read the attribute, at the cost of one join, inside the atomic stage-and-rename step. Groups that do read it are still re-applied by `reapplyGroupsReading`.

### Alternative D: Broadcast with `.over(case)` windows, then deduplicate into a lookup

Compute each Case Attribute as a window expression on the Event Log, then build the lookup with `unique` on `(case_id, fx_…)`.

*   **Pros**:
    *   The Duration Filter already uses this style of expression.
*   **Cons**:
    *   **One partition pass per window.** Every aggregate in every formula repeats a pass over the cases.
    *   **The join can duplicate rows.** `unique` over the values gives several lookup rows for a case whenever a value varies across its rows, or when a value is NaN. The join would then repeat Group rows.
*   **Reason for Rejection**: `group_by_stable(case_id).agg(...)` computes every attribute in one pass and returns exactly one row per case by construction.

### Alternative E: Store case values in a separate case-keyed file joined when read

Write one small Parquet per Case Attribute with columns `(case_id, value)`, and join it into a Group's frame whenever a view reads the Group.

*   **Pros**:
    *   **Editing a formula rewrites only one small file,** not the Event Log and every Group.
    *   **No value is repeated** on every row of a case.
*   **Cons**:
    *   **Every read path must learn the join:** the tree, statistics, distributions, the Filters and the data table.
    *   **It undoes ADR 0012's central decision:** materialize the column, so no read path needs to know about Custom Attributes.
*   **Reason for Rejection**: Read paths run far more often than Apply, and Parquet stores a value repeated within a case cheaply. The cost moves to the wrong side.

### Alternative F: Infer the scope from the operands instead of asking

Decide the scope from the formula itself. A formula with an aggregate, or only case-scoped columns, would be a Case Attribute; anything else would be an Event Attribute.

*   **Pros**:
    *   It is one fewer control in the editor.
*   **Cons**:
    *   **Some formulas fit either scope.** A formula of only numbers, or of one case column with resolution `constant`, gives the same value either way. The inferred scope would decide how the views treat it, without the user ever seeing that decision.
    *   **The scope could change as the user types.** Editing a formula could silently change it, and with it every view, Filter and stored setting that uses the attribute.
*   **Reason for Rejection**: The scope decides how every view counts the attribute, by event or by case. It must be a visible, fixed choice. The picker also lets the editor offer only the operands the chosen scope allows.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Performance.**
    *   Apply adds one `group_by_stable(case_id).agg(...)` pass over the Event Log, plus one left join per file.
    *   The lookup has one row per case. It is held in memory and shared read-only by the staging threads.
    *   Target: on the seeded `road_traffic_fine_10k` Project, an Apply with one Case Attribute takes at most twice as long as an Apply with one event attribute.
*   **Rollout and rollback.**
    *   Migration 0005 adds a column with a default, so existing Projects keep every attribute as Event scope and nothing is recomputed.
    *   An older build refuses a newer database (existing behaviour), so a rollback restores the backup the app takes before migrating.
    *   Parquet files written with Case Attribute columns stay readable by an older build, which treats them as event columns. An older build's next Apply of a Case Attribute would recompute it as event scope, since the old payload has no scope.
    *   An existing Event attribute that reads a case-scoped column keeps its applied column, but is refused when edited. No migration rewrites it, because the app has no users yet.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Files are grouped by layer, in the order they should be built. Each step is verifiable on its own.

### Target Files to Create/Modify

#### Step 1: Decision record and vocabulary

##### 1. `docs/adr/0020-case-attributes-are-whole-case-values-from-the-event-log.md` (Create)

*   **Type / Scope**: ADR.
*   **Proposed Changes**: Records the decision ADR 0012 deferred:
    *   A Case Attribute is computed once per case on the Event Log, over whole cases.
    *   Groups receive the value by a case-id join, never by aggregating their own rows.
    *   A trimmed Group carries whole-case values.
    *   The rejected alternatives are summarized: per-Group targeting, computing on each file's own rows, and a case-keyed file joined at read time.
    *   The top of the ADR says it amends ADR 0012.

##### 2. `docs/adr/0012-materialize-custom-attributes-by-id.md` (Modify)

*   **Type / Scope**: ADR.
*   **Proposed Changes**: Add the status line "Amended by 0020", following the pattern ADR 0005 uses. The text stays unchanged.

##### 3. `CONTEXT.md` (Modify)

*   **Type / Scope**: Domain vocabulary.
*   **Proposed Changes**:
    *   Rewrite the **Custom Attribute** entry so "computed for every event" describes Event scope only.
    *   Add **Event Attribute** and **Case Attribute** entries, with the whole-case rule.
    *   Add "metric" and "case metric" to the Avoid list.

##### 4. `src-tauri/CLAUDE.md` (Modify)

*   **Type / Scope**: Module guide.
*   **Proposed Changes**: The `custom_attributes` row mentions that a formula has a scope, the case lookup and join, and the dependency on `filters::predicates`.

#### Step 2: SQLite

##### 5. `src/lib/db/schema.ts` (Modify)

*   **Type / Scope**: Drizzle schema.
*   **Proposed Changes**: `customAttributes` gains `scope: text("scope", { enum: ["event", "case"] }).notNull().default("event")`.

##### 6. `src/lib/db/migrations/0005_custom_attribute_scope.sql` and `src/lib/db/migrations/meta/*` (Create, generated)

*   **Type / Scope**: Migration.
*   **Proposed Changes**:
    *   Generated with `pnpm db:generate custom_attribute_scope`. It contains one `ALTER TABLE custom_attributes ADD scope text DEFAULT 'event' NOT NULL`.
    *   The generated `meta/` files are committed.

##### 7. `src/lib/db/bundled-migrations.ts` (Modify, if the generator does not)

*   **Type / Scope**: Migration bundle.
*   **Proposed Changes**: Includes 0005, following the existing entries.

##### 8. `src/lib/db/migrate.test.ts` (Modify)

*   **Type / Scope**: Vitest.
*   **Proposed Changes**:
    *   The expected-schema list includes `custom_attributes.scope`.
    *   A new case starts from a version 4 database holding one Custom Attribute row, migrates it, and asserts that the row reads `scope = 'event'`.

#### Step 3: Rust formula and evaluator

##### 9. `src-tauri/src/filters/predicates.rs` (Modify)

*   **Type / Scope**: Rust.
*   **Proposed Changes**: `timestamp_millis` changes from `pub(super)` to `pub(crate)`. No change in behaviour.

##### 10. `src-tauri/src/custom_attributes/formula.rs` (Modify)

*   **Type / Scope**: Rust.
*   **Proposed Changes**:
    *   **New types.**
        *   `AttributeScope { Event, Case }`, with lowercase serde and `#[default] Event`.
        *   `AggregateFunction { Sum, Mean, Median, Min, Max, First, Last }`, lowercase.
        *   `FormulaContext<'a> { case_id: &'a str, timestamp: &'a str }`, with `FormulaContext::from_mapping(columns) -> Result<Self, String>` built on `require_role(CaseId)` and `require_role(CompleteTimestamp)`.
    *   **New variants.** `Formula::Aggregate { #[serde(rename = "fn")] function, column: String }`, `Formula::Count`, `Formula::Duration`.
    *   **`operands(&self) -> BTreeSet<&str>`.** The `column` and `aggregate` argument names. It replaces today's `columns()` for validation and the guards.
    *   **`read_columns(&self, scope, ctx) -> Vec<String>`.** `operands()`, plus the case id column for case scope, plus the timestamp column when the formula holds a `Duration` node. `impact` uses it to project the Parquet read.
    *   **`validate(&self, scope, columns)`.** Applies the validation table from the Technical Plan, with the same messages the TypeScript validator uses:
        *   "[x] matches no column."
        *   "[x] is not a number column."
        *   "[x] is a case column." / "[x] is an event column."
        *   "fn() is only available for Case attributes."
    *   **`to_expr(&self, scope, ctx) -> Expr`.** Event scope builds exactly today's expression. Case scope builds the aggregation expression from the Technical Plan's case expression table, casting every column to Float64. Both are wrapped in today's finite guard.
    *   **Tests**, in the file's `mod tests`:
        *   the new nodes deserialize from the JSON the frontend sends;
        *   every row of `src-tauri/tests/fixtures/formula-validation.json` gives the expected result;
        *   each aggregate on a fixture frame inside `group_by_stable(case).agg`: `sum` over values that are all null is null; `first` and `last` skip nulls; `min` and `max` on integers return Float64; `count()` counts rows including null values; `duration()` gives max minus min in days, with null timestamps skipped;
        *   a single-event case gives 0 for `duration()` and null for `x / duration()`;
        *   `column [x]` with resolution `last` reads the last row even when it is null.

##### 11. `src-tauri/tests/fixtures/formula-validation.json` (Create)

*   **Type / Scope**: Shared test data.
*   **Proposed Changes**: An array of `{ name, scope, formula, columns, expected: "ok" | { refused: string } }`. It covers every cell of the validation table, plus a hidden column, a text column, a column with a role, and an unknown column. Both the Rust and the Vitest suites read it.

#### Step 4: Rust Apply and impact

##### 12. `src-tauri/src/custom_attributes/mod.rs` (Modify)

*   **Type / Scope**: Rust.
*   **Proposed Changes**:
    *   `CustomAttribute` gains `#[serde(default)] pub scope: AttributeScope`.
    *   `Impact { events }` is renamed `Impact { total }`.
    *   **`validate(set, columns)`** checks each attribute with `formula.validate(attribute.scope, columns)`.
    *   **New `case_lookup(df, case_attributes, ctx) -> Result<Option<DataFrame>, String>`.** It returns `None` when there are no Case Attributes. Otherwise it returns `df.lazy().group_by_stable([col(ctx.case_id)]).agg(exprs aliased fx_{id}).collect()`.
    *   **`rewrite(df, event_attributes, remove_and_case_ids, lookup)`.** It drops columns, adds the row-wise event expressions as today, then, when a lookup is present, left-joins it on the case id with `JoinArgs::new(JoinType::Left)` and `maintain_order` set to `Left`. It returns an error naming the file if the joined height differs from the input height.
    *   **`stage(...)`** takes an optional pre-read frame, so the Event Log is read once, and returns nothing. Empty counts move out of `stage`.
    *   **`update(...)`**:
        1.  Validate.
        2.  Read the Event Log.
        3.  Split `set` by scope.
        4.  Build the context and the lookup when there are Case Attributes.
        5.  Compute the empty counts: event ids from the rewritten Event Log frame, case ids from the lookup's null counts.
        6.  Stage every file on threads, as today.
        7.  Rename the Group files, then the Event Log.

        The return type is unchanged: `Vec<EmptyCount>`, ordered like `set`.
    *   **`impact(project_dir, scope, formula, columns)`.** It reads `formula.read_columns(scope, ctx)`. For event scope it behaves as today, with `total` set to the number of rows. For case scope it builds the lookup for that one formula, with `total` set to the lookup's height and `empty` to its null count.
    *   **Stale doc comments go:** the comments on `update` saying "Groups are not re-filtered…" and "row-wise", and the module comment, now describe both scopes.
    *   **Tests**, extending today's `mod tests`. The `columns()` fixture gains a `ts` column with role `complete_timestamp` and a case-scoped number column. The Event Log fixture gains timestamps. New tests:
        *   a Case Attribute is written to the Event Log and to the Group with the same value for the same case;
        *   a trimmed Group (a fixture Group holding only some of a case's rows) carries the whole-case value;
        *   the row order and row count of the Group are unchanged after the join;
        *   editing a Case Attribute replaces its column, with no `_right` column;
        *   a mixed `set` writes both scopes and returns event counts and case counts;
        *   `impact` for case scope reports cases;
        *   a failure on one Group leaves every file as it was and no `.staged` file behind. The existing failure test is extended to a Case Attribute.

##### 13. `src-tauri/src/custom_attributes/commands.rs` (Modify)

*   **Type / Scope**: Tauri commands.
*   **Proposed Changes**: `custom_attribute_impact` gains `scope: AttributeScope`, passed to `impact`. `update_custom_attributes` is unchanged in signature, because the scope travels inside each `CustomAttribute`.

##### 14. `src-tauri/src/bin/seed-project.rs` (Modify)

*   **Type / Scope**: Seed binary.
*   **Proposed Changes**:
    *   Each manifest Custom Attribute carries `scope`, defaulting to event.
    *   The synthetic Column Mapping entry is built per scope, as `analysisColumns` builds it.
    *   `scope` is passed into `CustomAttribute`.

#### Step 5: Frontend types, parser and validator

##### 15. `src/lib/custom-attributes/invokers/types.ts` (Modify)

*   **Type / Scope**: TypeScript contracts.
*   **Proposed Changes**:
    *   Adds `AttributeScope = "event" | "case"` and `AggregateFunction`.
    *   `Formula` gains `{ kind: "aggregate"; fn: AggregateFunction; column: string }`, `{ kind: "count" }` and `{ kind: "duration" }`.
    *   `RequestCustomAttribute` gains `scope`.
    *   `ResponseCustomAttributeImpact.events` is renamed `total`.
    *   `ResponseEmptyCount`'s comment says the count is in events or cases, by scope.

##### 16. `src/lib/custom-attributes/types.ts` (Modify)

*   **Type / Scope**: TypeScript domain type.
*   **Proposed Changes**: `CustomAttribute` gains `scope: AttributeScope`. The comment describes both scopes, and says `emptyCount` counts events for Event scope and cases for Case scope.

##### 17. `src/lib/custom-attributes/utils/parser.ts` (Modify)

*   **Type / Scope**: Formula parser.
*   **Proposed Changes**:
    *   **Grammar.** A call is an atom: `name "(" [ "[" column "]" ] ")"`, with whitespace allowed as elsewhere.
    *   **Names.** Function names are lowercase. A known name in another case is an error: "Write sum in lowercase". An unknown name lists the known functions.
    *   **Arity.** `count` and `duration` take no argument: "count() takes no column". Every other function takes exactly one column: "sum() needs one column, like sum([cost])".
    *   **Output.** Calls produce `aggregate`, `count` and `duration` nodes, with the existing span type covering the call.

##### 18. `src/lib/custom-attributes/utils/print.ts` (Modify)

*   **Type / Scope**: Formula printer.
*   **Proposed Changes**: Prints the new nodes as `sum([cost])`, `count()` and `duration()`. Calls are atoms, so they need no parentheses for precedence.

##### 19. `src/lib/custom-attributes/utils/validate.ts` (Modify)

*   **Type / Scope**: Validator.
*   **Proposed Changes**:
    *   `operandColumns(project, scope)` returns the columns a `column` node may read in that scope. New `aggregateColumns(project)` returns the event-scoped number columns for `aggregate` arguments.
    *   `referencedColumns(formula)` follows `aggregate` arguments. New `directColumns(formula)` returns only `column` operands.
    *   `formulaColumnError(formula, project, scope)` applies the validation table. It returns `{ message, span }`, so the editor can highlight the operand that caused the error.

##### 20. `src/lib/custom-attributes/utils/blocks.ts`, `components/formula-blocks.svelte`, `components/block-palette.svelte` (Modify)

*   **Type / Scope**: Block view of a formula.
*   **Proposed Changes**:
    *   The new nodes render as blocks: `sum([cost])` shows the function name with its column chip inside, and `count()` and `duration()` show as single blocks.
    *   The palette offers a "Functions" group only when the draft's scope is Case. Picking `sum` inserts `sum([ ])` with the cursor inside the brackets.
    *   The palette's column list follows `operandColumns(project, scope)`.

##### 21. `src/lib/custom-attributes/state/drafts.svelte.ts` (Modify)

*   **Type / Scope**: Draft state.
*   **Proposed Changes**: `CustomAttributeDraft` gains `scope`. For an existing attribute, the draft's scope is always the stored one.

##### 22. `src/lib/custom-attributes/state/custom-attributes.svelte.ts` (Modify)

*   **Type / Scope**: State.
*   **Proposed Changes**:
    *   `createCustomAttribute` stores `draft.scope`.
    *   `applyCustomAttribute` sends `scope` in the request.
    *   `analysisColumns` emits each attribute's entry by its scope, as in the Technical Plan.
    *   `readersByColumn` uses `referencedColumns`, so it now includes aggregate arguments.
    *   New `directReadersByColumn` uses `directColumns`, for the resolution guard.

##### 23. `src/lib/custom-attributes/invokers/custom-attribute-impact.ts`, `invokers/update-custom-attributes.ts` (Modify)

*   **Type / Scope**: Invokers.
*   **Proposed Changes**: The impact invoker takes and sends `scope`. The update invoker sends each attribute's `scope`.

#### Step 6: Frontend UI and guards

##### 24. `src/lib/custom-attributes/components/attribute-editor.svelte` (Modify)

*   **Type / Scope**: Editor.
*   **Proposed Changes**:
    *   **Scope picker.** For a new attribute, a two-option control comes first. "Event: one value per event." "Case: one value per case, such as total cost per day." For a saved attribute it is read-only text: "Case attribute. Scope is fixed once saved."
    *   **Function list.** A collapsible list, shown for Case scope, gives each function with a one-line definition. It states the unit of `duration()` (days), that `first`/`last` skip empty values, and that `count()` counts events.
    *   **Impact message.** It reads `total` and the scope: "Calculates N of M cases" or "… events".
    *   **Highlighting.** The validator's span highlights the operand that caused the error.

##### 25. `src/lib/custom-attributes/components/attribute-card.svelte` (Modify)

*   **Type / Scope**: Card.
*   **Proposed Changes**: Shows "Case · Number" or "Event · Number" by scope. The empty-value sentence says "cases" or "values" by scope.

##### 26. `src/lib/custom-attributes/components/custom-attributes-page.svelte` (Modify)

*   **Type / Scope**: Page.
*   **Proposed Changes**: A new attribute's draft starts with `scope: "event"`. Nothing else changes, since the editor owns the picker.

##### 27. `src/lib/event-log/components/page/columns-editor.svelte` (Modify)

*   **Type / Scope**: Column Mapping editor.
*   **Proposed Changes**:
    *   The scope select (line 155) is also disabled when the column is in `readers`.
    *   The case-resolution select (line 173) is also disabled when the column is in the new direct readers.
    *   The explanatory text names the formulas, as it does today for hiding and retyping.
    *   It receives the direct readers as a new prop, built on the Project page next to `readers`.

##### 28. `src/lib/groups/utils/trimmed.ts` (Create)

*   **Type / Scope**: Pure function.
*   **Proposed Changes**: `isTrimmed(filters: Filter[]): boolean` returns true when the applied Filter List contains an attribute Filter with `mode === "keep_selected"` or a timeframe Filter with `mode === "trim"`. It uses the kinds in `src/lib/filters/kind/`.

##### 29. `src/lib/tree/components/case-strip.svelte` and `src/lib/statistics/components/attributes-pane.svelte` (Modify)

*   **Type / Scope**: Views.
*   **Proposed Changes**: When the shown attribute is a Case Attribute and a compared Group `isTrimmed(group.filters)`, the view shows the note "Case attributes are computed on whole cases" beside that Group.

#### Step 7: Seeds and docs

##### 30. `scripts/seed.ts` (Modify)

*   **Type / Scope**: Seed script.
*   **Proposed Changes**:
    *   `ManifestCustomAttribute` gains an optional `scope`, defaulting to `"event"`.
    *   `formulaColumnError` is called with that scope.
    *   The seeded SQLite row stores `scope`.

##### 31. `scripts/seed_log/road_traffic_fine_10k.json` (Modify)

*   **Type / Scope**: Seed manifest.
*   **Proposed Changes**:
    *   The existing "Paid share" = `[totalPaymentAmount] / [amount]` mixes a case column with an event column. It becomes a Case attribute, `[totalPaymentAmount] / sum([amount])` with `"scope": "case"`.
    *   Add "Amount per day" = `sum([amount]) / duration()` with `"scope": "case"`.
    *   Add one Group whose numeric Filter reads "Amount per day".
    *   Together these exercise CUJ 1 and CUJ 2.

##### 32. `scripts/CLAUDE.md` (Modify)

*   **Type / Scope**: Docs.
*   **Proposed Changes**: The manifest format documents `scope`.

#### Step 8: Frontend tests

##### 33. `src/lib/custom-attributes/tests/utils/{parser,print,validate,blocks}.test.ts`, `tests/state/{drafts,readers}.svelte.test.ts` (Modify)

*   **Type / Scope**: Vitest.
*   **Proposed Changes**:
    *   **Parser and printer.** Calls round-trip through parse and print. The error tests cover:
        *   an unknown function;
        *   a function name in uppercase;
        *   a wrong number of arguments.
    *   **Validator.** It runs every row of `src-tauri/tests/fixtures/formula-validation.json`.
    *   **Blocks.** The function blocks render correctly.
    *   **Readers.** They include aggregate arguments, and the direct readers exclude them.
    *   **Fixtures.** Existing fixtures gain `scope`.

##### 34. `src/lib/custom-attributes/tests/state/analysis-columns.svelte.test.ts` and `src/lib/groups/tests/utils/trimmed.test.ts` (Create)

*   **Type / Scope**: Vitest.
*   **Proposed Changes**:
    *   **`analysisColumns`.** It emits the case entry with `caseResolution: "constant"`.
    *   **`isTrimmed`.**
        *   Every Filter kind and mode except attribute `keep_selected` and timeframe `trim` returns false.
        *   Those two return true.

### Verification Plan

*   **Compilation/Build**: `cargo build` in `src-tauri/`, and `pnpm build`.
*   **Unit Tests**: `cargo test` in `src-tauri/`, and `pnpm test`. `pnpm check` skips test files, so both are needed.
*   **Static Analysis & Linting**: `pnpm check`, `cargo clippy`.
*   **Test Coverage Requirement**: every cell of the validation table and every aggregate has at least one test, on both the Rust and the TypeScript side where it applies.
*   **E2E/Integration**: `pnpm e2e:build`, then `pnpm e2e`. No new spec is added. Existing Custom Attribute specs must pass unchanged, which shows Event scope did not regress.
*   **Manual walkthrough**: run `pnpm seed road_traffic_fine_10k` and `pnpm tauri dev`, then check each CUJ:
    *   **CUJ 1.** Compare two Groups on "Amount per day".
    *   **CUJ 2.** Edit the formula and confirm that the Group reading it re-applies.
    *   **CUJ 3.** Add a `keep_selected` Group and confirm the note shows.
    *   **CUJ 4.** Type `[amount] / duration()` with Case scope and confirm the refusal and the highlight.

    Also time the Apply against the performance target.

--------------------------------------------------------------------------------

*Drafted with EGM*

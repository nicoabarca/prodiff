# Disjoint Comparisons

*   **Author:** Nicolás Abarca
*   **Status:** Proposed
*   **Date:** 2026-10-27

--------------------------------------------------------------------------------

## Overview

A Comparison in ProDiff measures two Groups against each other. Today the two Groups may share cases: a case in both is counted on both sides. The Compare popover reports how many cases are shared and offers to build a Difference Group.

This design makes sure no case is counted on both sides of a Comparison. Two terms are used throughout:

*   **Shared cases** are the cases whose case ID is in both Groups.
*   A **reduced side** is a Group with some cases removed for the Comparison. The Group itself, its Filter List and its Parquet file do not change.

When the two Groups share cases, the app removes the shared cases by a fixed rule before anything is drawn or tested:

| How the Groups relate | What is compared |
| :--- | :--- |
| Disjoint (no shared cases) | Both Groups as they are |
| Partial overlap (each Group also has cases of its own) | Both Groups, each with the shared cases removed |
| Contained (every case of one Group is in the other) | The inner Group whole, against the outer Group with the inner Group's cases removed |
| Identical (the same set of case IDs) | Nothing |

The app refuses a Comparison in two cases:

*   the Groups are identical;
*   one Group has no cases, so its side would be empty.

The rule is applied in Rust, in the one function every comparison command reads its Groups through. Nothing about it is stored. Cases are removed whole, never event by event, so no trace is cut.

Because the app now changes what is compared without asking, every comparison view shows one plain sentence saying which Groups are compared and how many cases were removed from which side.

## The Problem

Every Significance Test the app runs assumes its two samples are independent. Mann-Whitney U handles numbers and chi-square handles categories, both in `src-tauri/src/analysis/stats.rs`.

A case that belongs to both Groups contributes the same observations to both samples, which breaks that assumption. The p-values and effect sizes then no longer have their stated meaning. The size and the direction of the error depend on how many cases are shared, and the app does not measure either.

The app warns today, but the warning does not solve the problem:

*   **The overlap is reported, not removed.** The user can read the warning, skip it, and compare anyway. Every view then draws and tests overlapping samples.
*   **The warning claims a direction it cannot support.** It says shared cases make the findings "optimistic" (`compare-popover.svelte`). No source supports that direction.
*   **The offered fix covers one case only.** "Compare against B without those cases" builds a Difference Group that keeps the first Group whole and removes the shared cases from the second.
    *   That is correct when the first Group sits inside the second.
    *   For a partial overlap it favours the first Group, because only the second loses cases.
    *   It adds a Group to Group Filters for every Comparison it fixes.
*   **The most common Comparison always overlaps.** A Group compared with the whole Event Log is always contained. ADR 0006 calls this the most common Comparison in the app.

## Goals

*   **No case is counted on both sides.** The five comparison commands never work on two sides that share a case:
    *   `list_variants`
    *   `directed_tree`
    *   `node_distributions`
    *   `dfg`
    *   `group_comparison`

    Rust enforces this in `analysis::read_groups`, whatever view or Saved Comparison called it.
*   **A fixed, predictable rule**, as in the Overview table, with no user choice and nothing stored.
*   **The user always knows what they see.** Every comparison view shows one always-visible sentence that names both Groups and says how many cases were removed from which side. The views are Statistics, the tree, the Directly-Follows Graph and Distributions. When a side has fewer than 5 cases, the sentence also says its tests were skipped.
*   **Numbers on one screen agree.** Every figure on a comparison view describes the reduced sides.
*   **Refused when read.**
    *   An identical pair, or a pair with an empty side, is refused by the Compare popover before comparing.
    *   It is refused by Rust on every other path, such as a Group edited after the Comparison was chosen.
    *   After an Apply in Group Filters, a non-blocking note says which Comparisons naming that Group can no longer be compared.

## Non-Goals

*   **Letting the user choose how an overlap is resolved.** A user who wants one Group kept whole in a partial overlap builds a Group with a `case_not_in_group` Filter in Group Filters.
*   **Storing anything about the reduction.** No schema change, and no change to Saved Comparison identity (ADR 0018 stands).
*   **Blocking an Apply.** An Apply always succeeds. The note after Apply and the refusal when read cover the result.
*   **Refusing small sides.** The existing per-test gates already skip a test when a side has fewer than 5 cases (`MIN_GROUP_CASES`).
*   **Paired or dependent-sample tests.** Two Groups with the same cases but different trims are refused, not tested as paired data.
*   **Removing shared events inside traces.** ADR 0006 rejected this, because it would fabricate traces no case walked.
*   **Comparisons of more than two Groups.** `read_groups` stays capped at two.
*   **Showing which cases were removed.** See Future Improvements.

## Critical User Journeys (CUJs)

The quoted copy is defined once, in "Copy" under the Technical Plan.

### CUJ 1: Compare two partially overlapping Groups

*   **Given**:
    *   Approved has 1,240 cases.
    *   Slow cases has 760 cases.
    *   The two share 310 cases, and neither contains the other.
*   **When**: The user picks Approved and Slow cases in the Compare popover.
*   **Then**:
    *   Before the user clicks Compare, the popover shows the partial-overlap text.
    *   After comparing, every view draws Approved with 930 cases and Slow cases with 450.
    *   Every comparison view shows the sentence "Approved vs Slow cases, 310 shared cases removed from both".

### CUJ 2: Compare a Group with the Event Log

*   **Given**: Approved holds 1,240 of the Event Log's 4,000 cases.
*   **When**: The user compares Event Log with Approved.
*   **Then**:
    *   The popover shows the contained text.
    *   The views compare the Event Log's 2,760 other cases with Approved's 1,240.
    *   The side is still called "Event Log".
    *   The sentence reads "Event Log vs Approved, 1,240 cases removed from Event Log".

### CUJ 3: Try to compare identical Groups

*   **Given**: The Group "Trimmed to review steps" uses only `trim` Filters, so it keeps every case of the Event Log.
*   **When**: The user picks Event Log and "Trimmed to review steps".
*   **Then**: The popover shows the identical text, visible without hovering, and the Compare button stays disabled.

### CUJ 4: A Group edit creates an overlap

*   **Given**: Approved vs Rejected is in use and disjoint.
*   **When**: The user edits Rejected in Group Filters so that it now holds 40 Approved cases, applies it, and opens the tree.
*   **Then**:
    *   The tree rebuilds with the 40 shared cases removed from both sides.
    *   The sentence reads "Approved vs Rejected, 40 shared cases removed from both".
    *   No dialog appears.

### CUJ 5: An Apply makes a Comparison identical

*   **Given**:
    *   Approved vs "Approved, recent" is in use, where "Approved, recent" is Approved plus a date Filter.
    *   A Saved Comparison "Slow cases vs Approved, recent" also exists.
*   **When**: In Group Filters, the user removes the date Filter from "Approved, recent" and clicks Apply.
*   **Then**:
    *   The Apply succeeds.
    *   A non-blocking note names Approved vs "Approved, recent" as no longer comparable. The Saved Comparison with Slow cases is not named, because it still works.
    *   Opening any comparison view shows the identical text in place of the canvas or figures, with the Compare field to pick another Comparison.

### CUJ 6: A Custom Attribute change makes a Comparison identical

*   **Given**: Approved vs "High score" is in use, and "High score" filters on a Custom Attribute.
*   **When**: The user edits the Custom Attribute's formula and applies it. That re-applies every Group, and "High score" now holds the same cases as Approved.
*   **Then**:
    *   No note appears, because this path does not go through Group Filters.
    *   Every comparison view shows the identical text in place of its canvas or figures.

### CUJ 7: A small side has its tests skipped

*   **Given**: Approved has 1,000 cases, and 997 of them are in Slow cases. Slow cases also has cases outside Approved. That is a partial overlap, so Approved keeps 3 cases.
*   **When**: The user compares Approved with Slow cases.
*   **Then**: The tree is drawn and its tests are skipped. The sentence reads "Approved vs Slow cases, 997 shared cases removed from both. Tests skipped for Approved: fewer than 5 cases."

### CUJ 8: A Saved Comparison that can no longer be compared

*   **Given**: The Saved Comparison Approved vs "Approved, recent" now names identical Groups.
*   **When**: The user clicks that row in the Compare popover.
*   **Then**: The comparison in use does not change, and the identical text appears under the row.

### CUJ 9: Distributions

*   **Given**: CUJ 1's Comparison is in use.
*   **When**: The user opens a tree node's Distributions.
*   **Then**: The Distributions header row shows the same sentence, and the counts describe the reduced sides.

### CUJ 10: First launch after the update

*   **Given**: Before the update, the user saved Event Log vs Approved, and it is in use.
*   **When**: The user opens the project, which lands on Statistics.
*   **Then**:
    *   Statistics compares the 2,760 Event Log cases outside Approved with Approved.
    *   The sentence states the removal.
    *   The Saved Comparison row is unchanged.

## Open Questions

*   None.

## Technical Plan (Architecture)

### Data flow

```text
  Group Filters ── Apply ──▶ group Parquet        (unchanged)
         │
         └─ after Apply: comparison_relation per Comparison naming the Group
                         ──▶ non-blocking note if one can no longer be compared

  comparisonKey() changes
         │
         ▼
  comparison_relation ──▶ relation state (loading | ready | failed)
         │                        │
         │                        ├─▶ Compare field sentence, Distributions header
         │                        └─▶ refusal view in place of canvas or figures
         ▼
  relationReady() ──gate──▶ list_variants, directed_tree, node_distributions,
                            dfg, group_comparison
                                     │
                                     ▼
                              read_groups ──▶ reduce ──▶ reduced sides
```

### The rule in one place

`src-tauri/src/analysis/reduction.rs` holds the rule. It reads only the case column of each side. It casts the column to String, drops nulls, and keeps the unique values, so a row with a null case ID is never shared.

It classifies the pair from `|A|`, `|B|` and `|A ∩ B|`:

| Condition | Status | Relation | Removed |
| :--- | :--- | :--- | :--- |
| `|A| = 0` or `|B| = 0` | `empty` | none | none |
| `shared = |A| = |B|` | `identical` | `identical` | none |
| `shared = 0` | `ok` | `disjoint` | none |
| `shared = min(|A|, |B|)` and `|A| ≠ |B|` | `ok` | `contained` | the intersection, from the larger Group only |
| `0 < shared < min(|A|, |B|)` | `ok` | `partial` | the intersection, from both Groups |

The rows are checked in order. In both overlapping relations the removed cases are the intersection, computed once from the original sets. The relations differ only in which sides lose it.

`read_groups` calls this rule for every two-Group request. Single-Group views are a description, not a Comparison, so they read their Group unchanged.

### Contract

All types are defined here and nowhere else.

| Item | Definition |
| :--- | :--- |
| `pub(crate) fn plan(first: &GroupLog, second: &GroupLog, case_col: &str) -> Result<Plan, String>` | Classifies the pair and chooses what each side loses. The `Err` holds I/O or column errors only. |
| `struct Plan` (private) | `{ summary: RelationSummary, drop: HashMap<String, Series> }`. `drop` maps a Group id to the case IDs that side loses. A side that loses nothing has no entry. |
| `pub(crate) fn reduce(logs: Vec<GroupLog>, case_col: &str) -> Result<Vec<GroupLog>, String>` | Calls `plan`, then, for each side in `drop`, keeps the rows whose case ID is not in its set. Rows with a null case ID are kept. Returns `Err(REFUSED)` when the status is not `ok`. |
| `RelationSummary` | `#[derive(Serialize)] #[serde(rename_all = "camelCase")]` with fields `status: Status`, `relation: Option<Relation>`, `inner: Option<String>`, `cases: HashMap<String, i64>`, `kept: HashMap<String, i64>`, `removed: HashMap<String, i64>`. All maps are keyed by Group id. `inner` is set only for `contained`. |
| `Status`, `Relation` | Serde camelCase enums: `ok \| identical \| empty` and `disjoint \| partial \| contained \| identical`. |
| `REFUSED` | A `const &str` in `reduction.rs`: "These groups cannot be compared. Pick another comparison." |
| `comparison_relation(project_id, group_ids, columns) -> Result<RelationSummary, String>` | A Tauri command in `src-tauri/src/statistics/commands.rs`. It requires exactly two ids, and otherwise returns `Err("comparison_relation takes two group ids")`. It reads only the case column of each Group and returns `plan(...).summary`. |
| `ResponseRelation` | TypeScript mirror of `RelationSummary` in `src/lib/groups/invokers/types.ts`: `{ status: "ok" \| "identical" \| "empty"; relation: "disjoint" \| "partial" \| "contained" \| "identical" \| null; inner: string \| null; cases: Record<string, number>; kept: Record<string, number>; removed: Record<string, number> }`. |

The five comparison commands keep `Result<_, String>`. A refusal reaches the interface as data, through `comparison_relation`, because the views wait for it before they build.

`read_groups` still returns `REFUSED` if a request reaches it with an invalid pair, for example in a race with an Apply. The view shows that message as an error.

### Relation state and gating

`src/lib/groups/state/comparison.svelte.ts` stays the one owner of "what is compared".

*   **`comparisonKey()`** is `JSON.stringify` of `[id, revision]` per compared Group, or `[id]` for the Original.
    *   A revision is an in-memory counter, never stored. Only `applyGroup` and `reapplyGroupsReading` bump it.
    *   Renaming or recolouring a Group never changes the key.
*   **`relation`** is `{ key, state: "loading" | "ready" | "failed", summary: ResponseRelation | null }`.
    *   One effect in the project layout calls `loadRelation(project)` whenever `comparisonKey()` changes.
    *   A response whose key no longer matches is dropped, so the last request wins.
    *   A single-Group Comparison is ready at once, with no summary.
*   **`relationReady()`** is true when the state is `ready` and the status is `ok`, or when one Group is compared. It gates every build path:
    *   the tree's `inputsReady`
    *   the DFG's `load`
    *   `loadVariants` and `loadDistributions`
    *   the Statistics effect

Every view cache key is built from `comparisonKey()`: `treeKey`, `dfgKey`, `variantsKey` and the Statistics `wantedKey`. This also fixes a current bug: `dfgKey` and `variantsKey` key on bare ids today, so re-applying a Group leaves the DFG and the Variant list stale.

### Statistics from the same reduction

`GroupFigures` in `src-tauri/src/statistics/mod.rs` gains `stats: EventLogStats`. It is computed by `stats::summarize` on each reduced side inside `group_comparison`.

`statistics-view.svelte` builds its per-Group `stats` record from that payload, not from `computeStats`, so the `figures.ts` functions, which already take that record, describe the reduced sides. Group cards and the Home overviews keep `computeStats` and `group_stats`.

The Statistics Data drawer opens a reduced side through the table's existing `narrowed` prop, with this narrowing:

`{ group, filters: [{ kind: "case_not_in_group", groupId: other.id }], label: "Without cases shared with {other}" }`

That narrowing removes from a reduced side exactly the cases the rule removes, because both read the other Group's Parquet. Nothing moves out of `statistics/`.

### What the user sees

*   **Comparison note** (`src/lib/groups/components/comparison-note.svelte`). Plain text, rendered outside the `CompareField` trigger.
    *   Placement:
        *   under the controls in the tree toolbar, the DFG toolbar and the Statistics header;
        *   in the existing node header row of Distributions, which drills into one tree node and has no `CompareField`.
    *   It shows only when two Groups are compared and either cases were removed or a side has fewer than 5 cases.
*   **Compare popover.**
    *   **Removed:** the shared-cases block, the Difference Group button and `compareDifference`.
    *   **When two Groups are picked,** it calls `comparison_relation` for the pair and shows the matching text. Compare and Save & compare are disabled while the call runs, and stay disabled when the status is not `ok`. A response for a pair the user has since changed is dropped.
    *   **Clicking a Saved Comparison** checks its relation first. A refused pair shows its text under the row, and the comparison in use does not change.
*   **Refusal view** (`src/lib/groups/components/comparison-refused.svelte`). It shows the identical or empty text and a `CompareField`, in place of the canvas or figures on each comparison view.
*   **Note after Apply** (`checkAfterApply(project, group)` in `comparison.svelte.ts`).
    *   After an Apply in Group Filters, it calls `comparison_relation` for each two-Group Comparison naming that Group: the one in use and each Saved Comparison.
    *   For each one whose status is not `ok`, it raises a `svelte-sonner` warning toast, as `src/lib/updater/offer-update.ts` already uses the library.

### Copy

Numbers go through `formatNumber`. A count of one uses the singular ("1 shared case").

*   **Popover, partial overlap:** "Approved and Slow cases share 310 cases. Tests need groups with no case in common, so those cases are removed from both."
*   **Popover, contained:** "Every Approved case is also in Event Log. Tests need groups with no case in common, so Approved's cases are removed from Event Log."
*   **Popover, disjoint:** "Groups don't share common cases" (the existing line).
*   **Identical:** "These groups hold exactly the same cases, so there is nothing to compare. View one of them on its own."
*   **Empty:** "{Group} has no cases, so there is nothing to compare."
*   **Comparison note:**
    *   "{A} vs {B}, {N} shared cases removed from both", or "{A} vs {B}, {N} cases removed from {outer}".
    *   When a side has fewer than 5 cases, it appends " Tests skipped for {Group}: fewer than 5 cases."
*   **Note after Apply:** "{A} vs {B} can no longer be compared: the groups hold the same cases." For an empty side: "... : {Group} has no cases."

"vs" is the label joiner the app already uses in `compare-popover.svelte`. `CONTEXT.md` avoids "versus" as a name for the Comparison concept, not as a joiner in labels.

## Alternatives Considered

### Policy

#### Alternative A: Keep reporting the overlap (today's behaviour)

*   **Pros**: No code change. "X vs the whole Event Log" stays as it is.
*   **Cons**: The warning can be skipped, so tests keep running on overlapping samples. The one fix it offers covers only containment.
*   **Reason for Rejection**: The independence assumption stays broken whenever the user skips the warning.

#### Alternative B: The user picks how each partial overlap is resolved

*   **Pros**: In a partial overlap the user chooses between removing the shared cases from both Groups, keeping the first Group whole, or keeping the second whole. This avoids the near-containment jump (see Risks).
*   **Cons**:
    *   **Schema:** the choice must be stored on `comparisons` and `saved_comparisons`. That needs a `0005` migration, after which older builds cannot open the database.
    *   **Saved Comparison identity:** the choice joins it, or becomes an editable field on each row.
    *   **Stale choices:** a stored choice must be ignored whenever the Groups stop being a partial overlap. A stored "remove from both" would empty the inner Group once one Group contains the other.
    *   **Cache keys:** the choice joins every one of them.
*   **Reason for Rejection**: A migration and an identity change buy one choice in one relation. The same outcome is available by building a Group with a `case_not_in_group` Filter.

#### Alternative C: Remove the shared cases from the larger Group only

*   **Pros**: A continuous rule. Containment is its limit case, and it never leaves a mostly contained Group with a tiny side.
*   **Cons**:
    *   The meaning is asymmetric, for example "Approved without Slow cases" against "all of Slow cases".
    *   Groups of equal size need a tie rule that cannot depend on pick order.
    *   An edit that makes the smaller Group overtake the larger one flips which side loses cases, without either Group's definition changing much.
*   **Reason for Rejection**: The comparison's meaning would depend on relative size and could change silently. Removing from both sides gives a contrast that does not depend on size.

#### Alternative D: Build Difference Groups for every overlap

*   **Pros**: Reuses today's mechanism, with no Rust read changes.
*   **Cons**:
    *   A partial overlap adds two Groups to Group Filters for every Comparison.
    *   Deleting a Group cascades to every Group that excludes it.
    *   The names ("A without B") nest.
*   **Reason for Rejection**: It fills the Group list with Groups the user did not ask for. Groups are created only in Group Filters.

#### Alternative E: Draw the views but suppress p-values for overlapping pairs

*   **Pros**: Every Comparison stays drawable.
*   **Cons**: The tree, the Directly-Follows Graph and Distributions still count shared cases on both sides. The most common Comparison loses every test.
*   **Reason for Rejection**: It withholds the p-value but keeps double-counting in every figure.

#### Alternative F: Use tests for paired or partially overlapping samples

*   **Pros**: Keeps every case on both sides.
*   **Cons**: Needs new statistical code for each test and attribute kind. Does nothing for the views that draw counts.
*   **Reason for Rejection**: The scope is a different feature. It can be reconsidered if paired comparison becomes a need.

#### Alternative G: Remove the shared events instead of the shared cases

*   **Pros**: Keeps more data on each side.
*   **Cons**: It produces traces no case walked.
*   **Reason for Rejection**: ADR 0006 rejected this already.

#### Alternative H: Refuse a Comparison when a side has fewer than 5 cases

*   **Pros**: No Comparison too small to mean anything is ever drawn.
*   **Cons**:
    *   It duplicates the per-test gates (`tree/mod.rs:514,725`, `statistics/mod.rs:397,445`, `dfg/mod.rs:211`).
    *   It changes today's behaviour for small disjoint Groups.
    *   It would put existing users on a refusal screen when Statistics opens after the update.
*   **Reason for Rejection**: The gates already withhold the tests. The note states it, and the paths stay visible.

### Mechanism

#### Alternative I: Check validity in the frontend only

*   **Pros**: No Rust change.
*   **Cons**:
    *   Statistics, the landing view, calls `group_comparison` from its own effect.
    *   The views build when their keys change.
    *   A Saved Comparison click copies ids straight into `comparisons`.
*   **Reason for Rejection**: Only `read_groups` sees every path.

#### Alternative J: Block an Apply that would invalidate a Comparison

*   **Pros**: The user learns at the moment of the edit.
*   **Cons**:
    *   **More parts:** a partner argument on `apply_group`, a conflicts error and a dialog.
    *   **Blocks unrelated edits:** a pair that was already invalid before the edit blocks every later edit of either Group.
    *   **Incomplete:** a Custom Attribute re-apply still goes around it.
*   **Reason for Rejection**: The refusal when read is needed anyway. The note after Apply gives the same information without blocking.

#### Alternative K: A typed `CommandError` for refusals

*   **Pros**: Refusals reach every command's caller as data.
*   **Cons**: `off_main_thread` (`src-tauri/src/parsing/commands.rs:34-40`) takes and returns `Result<T, String>`. Six commands, their tail expressions and the importer's `groups::apply` caller would all change.
*   **Reason for Rejection**: With the views gated on `comparison_relation`, a refusal never needs to travel as an error.

#### Alternative L: Echo removed counts in every view payload

*   **Pros**: Each label comes from the read that produced its figures.
*   **Cons**:
    *   Five payloads change shape.
    *   `list_variants` returns a bare list.
    *   Distributions and the Compare field would still need their own read.
*   **Reason for Rejection**: The views wait for `comparison_relation`, which calls the same `plan` as `reduce`. A change between the two reads is caught by the `read_groups` refusal or by a key change.

#### Alternative M: The Data drawer through `reduce`

*   **Pros**: One path for every figure.
*   **Cons**: The drawer pages a Filter List through `group_preview`. Paging reduced frames would need a new command.
*   **Reason for Rejection**: The drawer is a raw event table. Its `case_not_in_group` narrowing removes the same cases, because it reads the same Parquet, so the second path is accepted.

#### Alternative N: Label reduced sides with set notation or "without" text

*   **Pros**: "Approved ∖ Slow cases" is compact; "Approved without Slow cases" explains itself.
*   **Cons**:
    *   Set notation needs explaining to users who do not know it, and can be misread as "/".
    *   "Without" text reuses the names Difference Groups carry, nests, and loses its tail to truncation.
*   **Reason for Rejection**: A plain sentence in one place states the reduction without renaming any Group.

## Risks & Mitigations

| Risk | How it shows up | Mitigation |
| :--- | :--- | :--- |
| The meaning of a Comparison changes | "Event Log vs Approved" now compares the cases outside Approved with Approved. | The sentence on every comparison view, and the release notes. |
| Results change after the update | Existing overlapping Comparisons give different numbers. | The sentence and the release notes. No Comparison is refused for size. |
| The rule jumps near containment | If Approved has 1,000 cases and 997 are in Slow cases, Approved keeps 3 and its tests are skipped. If all 1,000 were inside, Approved would stay whole. | Accepted. The sentence states the skipped tests. A Group with a `case_not_in_group` Filter keeps one side whole. |
| The relation and a view read race an Apply | A label and a figure briefly describe different file states. | Last request wins by `comparisonKey()`. Views build only after the relation is ready. `read_groups` refuses an invalid pair. |
| Cases are independent but events are not | Per-event values within one case still repeat, for example in the Directly-Follows Graph. | Stated as a limit. Disjoint sides make cases independent, not events. |
| Null case IDs | Rows with a null case ID could all look like one case. | Nulls are dropped from the case sets, so such rows are never shared and never removed. |
| Reading case IDs from a large Event Log | `comparison_relation` and every build read the case column of the Event Log side. | Only the case column is read, with Polars `unique` and an anti-join. No string set is built row by row. |

## Non-Functional Requirements

*   **Performance:** `comparison_relation` runs once per change of `comparisonKey()`, plus once per affected Comparison after an Apply. Each comparison command runs the rule once per build.
*   **Rollout and rollback:**
    *   No schema change and no data migration, so rolling back is reverting the code.
    *   The release notes must say that Comparisons whose Groups share cases now show different numbers.
*   **Security and privacy:** None. Everything stays on the device.

## Future Improvements

*   **Removed-count chips on side names.** A "−N" chip on every legend, header and panel name, so a screenshot shows the reduction.
*   **Browsing the removed cases.** A hover card on the chip, and an internal `case_in_group` Filter kind that opens the removed cases in the event table. This needs:
    *   `group-name.svelte` and the table moved to `groups/`, so `groups` does not import `statistics`;
    *   a drawer owner shared by the views;
    *   keyboard and touch access.
*   **A user-picked rule for partial overlap** (Alternative B), if building a `case_not_in_group` Group proves too indirect.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Four phases. Each phase leaves the app working, with `pnpm check`, `pnpm test` and `cargo test` passing. Tests land in the phase of the code they cover.

### Phase 1: The rule in Rust, and Statistics figures

#### 1. `src-tauri/src/analysis/reduction.rs` (Create)

*   **Type / Scope**: Rust module and unit tests.
*   **Proposed Changes**:
    *   Implements `plan`, `reduce`, `Plan`, `RelationSummary`, `Status`, `Relation` and `REFUSED` exactly as in the Contract table.
    *   Case sets come from `df.column(case_col)`, cast to `DataType::String`, `drop_nulls`, then `unique`.
    *   `shared` is the length of the first set filtered by `is_in` against the second.
    *   `reduce` keeps a row when `col(case_col).cast(String).is_in(drop).fill_null(false).not()` holds. That keeps rows with a null case ID.
*   **Tests**:
    *   each of the five rows of the classification table;
    *   two empty Groups give `empty`;
    *   in a partial overlap both sides lose the intersection;
    *   in a contained pair only the larger side loses it;
    *   identical case sets with different events (trimmed) give `identical`;
    *   integer case IDs;
    *   null case IDs are never shared and their rows are kept;
    *   the serialized JSON of `RelationSummary` uses camelCase keys and values.

#### 2. `src-tauri/src/analysis/mod.rs` (Modify)

*   **Type / Scope**: Rust module.
*   **Proposed Changes**:
    *   Declares `pub mod reduction;`.
    *   `read_groups(project_dir, groups, columns: &[ColumnMapping]) -> Result<Vec<GroupLog>, String>` resolves the case column with `column_mapping::require_role(columns, ColumnRole::CaseId)`. It returns one Group unchanged, and passes two Groups through `reduction::reduce`.
    *   The existing empty-list and more-than-two errors stay.
*   **Tests**: one id returns the frame unchanged; two overlapping ids return reduced frames.

#### 3. `src-tauri/src/tree/commands.rs`, `src-tauri/src/dfg/commands.rs`, `src-tauri/src/statistics/commands.rs` (Modify)

*   **Type / Scope**: Tauri commands.
*   **Proposed Changes**:
    *   The five comparison commands pass `&columns` to `read_groups`. Return types do not change.
    *   The module comment in `tree/commands.rs` gains: "Two Groups are read with their shared cases removed (`analysis::reduction`)."

#### 4. `src-tauri/src/statistics/commands.rs` (Modify)

*   **Type / Scope**: Tauri command.
*   **Proposed Changes**: Adds `comparison_relation` as in the Contract table.
    *   It reads each Group's case column with `groups::storage::read_case_column` (item 5), wraps it in a `GroupLog`, and returns `reduction::plan(...)?.summary`.

#### 5. `src-tauri/src/groups/storage.rs` (Modify)

*   **Type / Scope**: Rust storage.
*   **Proposed Changes**: Adds `pub(crate) fn read_case_column(project_dir, group_id, case_col) -> Result<DataFrame, String>`.
    *   It scans the same Parquet `read_group` reads (the Event Log for `ORIGINAL`) and selects only `case_col`.

#### 6. `src-tauri/src/lib.rs` (Modify)

*   **Type / Scope**: Command registration.
*   **Proposed Changes**: Registers `comparison_relation`. `shared_cases` stays registered until Phase 3.

#### 7. `src-tauri/src/statistics/mod.rs` (Modify)

*   **Type / Scope**: Rust payload.
*   **Proposed Changes**: `GroupFigures` gains `stats: EventLogStats`, set to `stats::summarize(&log.df, columns)?` for each reduced side inside `compare`.

#### 8. `src-tauri/src/tree/mod.rs`, `src-tauri/src/dfg/mod.rs`, `src-tauri/src/dfg/build.rs` (Modify)

*   **Type / Scope**: Rust payloads and tests.
*   **Proposed Changes**:
    *   Removes `overlap_cases` from `DirectedTree` and `Dfg`, with the code that fills them:
        *   `overlap` at `tree/mod.rs:650-656` and its call at line 607;
        *   the overlap count at `dfg/build.rs:211` and its helper at lines 403-417.
    *   Removes the tests `overlapping_groups_are_counted_rather_than_rejected` (`tree/mod.rs:1139`, `dfg/mod.rs:671`).

#### 9. Frontend payload types and their readers (Modify)

*   **Type / Scope**: TypeScript types, Svelte components, Vitest fixtures.
*   **Proposed Changes**:
    *   **Payload types:**
        *   `src/lib/tree/invokers/types.ts` and `src/lib/dfg/invokers/types.ts` remove `overlapCases`.
        *   `src/lib/statistics/invokers/types.ts` adds `stats: ResponseEventLogStats` to the `GroupFigures` type, imported from `groups/invokers/types`.
    *   **Overlap warnings removed:**
        *   `src/lib/tree/components/case-strip.svelte`, lines 55 and 171-181.
        *   `src/lib/dfg/components/dfg-toolbar.svelte`, lines 55-57.
    *   **Fixtures without `overlapCases`:**
        *   `src/lib/tree/tests/utils/tree.test.ts`
        *   `src/lib/tree/tests/state/auto-build.svelte.test.ts`
        *   `src/lib/dfg/tests/utils/simplify.test.ts`
        *   `src/lib/devtools/tests/utils/json.test.ts`
        *   `src/lib/devtools/tree/tests/utils/inspect.test.ts`
        *   `src/lib/devtools/dfg/tests/utils/inspect.test.ts`
    *   **Fixtures with `stats`:** `src/lib/statistics/tests/utils/figures.test.ts` adds `stats` to each `GroupFigures` fixture, reusing the fixture's existing `ResponseEventLogStats` values.

#### 10. `src/lib/statistics/components/statistics-view.svelte` (Modify)

*   **Type / Scope**: Svelte component.
*   **Proposed Changes**:
    *   When two Groups are compared, the `stats` record passed to the panes comes from the `group_comparison` payload: one entry per `groups[i].id`, `groups[i].stats`. This replaces the `computeStats` call (lines 94-101).
    *   A single Group keeps `computeStats`.
    *   The existing skeletons show until the payload loads.

### Phase 2: Frontend state, keys and gating

#### 11. `src/lib/groups/invokers/comparison-relation.ts` (Create) and `src/lib/groups/invokers/types.ts` (Modify)

*   **Type / Scope**: Invoker and types.
*   **Proposed Changes**:
    *   `comparisonRelation(project, groupIds): Promise<ResponseRelation>` invokes `comparison_relation` with `analysisColumns(project)`.
    *   `types.ts` adds `ResponseRelation` as in the Contract table.

#### 12. `src/lib/groups/state/groups.svelte.ts` (Modify)

*   **Type / Scope**: Svelte state.
*   **Proposed Changes**:
    *   Adds `revisions = $state<Record<string, number>>({})` and `revisionOf(id)`, which returns 0 when absent.
    *   `applyGroup` increments `revisions[group.id]` after the Parquet is written.
    *   `reapplyGroupsReading` increments it for each Group it re-applies.
    *   `patch` does not change.

#### 13. `src/lib/groups/state/comparison.svelte.ts` (Modify)

*   **Type / Scope**: Svelte state.
*   **Proposed Changes**:
    *   Adds `comparisonKey()`, `relation`, `loadRelation(project)` and `relationReady()` as described in "Relation state and gating".
    *   `loadRelation` records the key before the call. It stores the response only if `comparisonKey()` still equals that key. A rejected call sets the state to `failed`, with the message.

#### 14. `src/routes/app/projects/[id]/+layout.svelte` (Modify)

*   **Type / Scope**: Route.
*   **Proposed Changes**: One `$effect` that calls `loadRelation(project)` when `comparisonKey()` changes.

#### 15. `src/lib/tree/utils/settings.ts` and `src/lib/tree/state/build.svelte.ts` (Modify)

*   **Type / Scope**: Cache keys and tree build state.
*   **Proposed Changes**:
    *   `treeKey(comparisonKey: string, settings: TreeSettings)` replaces `treeKey(groups, settings)`, `treeKeyFromGroupKeys` and `groupKey`.
    *   In `build.svelte.ts`:
        *   `BuildRequest.groupKeys` becomes `key: string`, captured by `snapshot()` before the `await`.
        *   `matchesCurrentKey` and the staleness check compare it with a fresh `treeKey(comparisonKey(), settings)`.
        *   `inputsReady` also requires `relationReady()`.

#### 16. `src/lib/dfg/types.ts` and `src/lib/dfg/state/dfg.svelte.ts` (Modify)

*   **Type / Scope**: Cache key and DFG state.
*   **Proposed Changes**:
    *   `dfgKey(comparisonKey: string, attributes, selectedVariants)`.
    *   `dfg.svelte.ts` passes `comparisonKey()` at lines 41 and 55, and `load` returns early unless `relationReady()`.

#### 17. `src/lib/tree/state/variant-selection.svelte.ts` and `src/lib/distributions/state/distributions.svelte.ts` (Modify)

*   **Type / Scope**: Svelte state.
*   **Proposed Changes**:
    *   `variantsKey` returns `comparisonKey()`.
    *   `loadVariants` and `loadDistributions` return early unless `relationReady()`.

#### 18. `src/lib/statistics/components/statistics-view.svelte` (Modify)

*   **Type / Scope**: Svelte component.
*   **Proposed Changes**:
    *   `wantedKey` is built from `comparisonKey()`, and the fetch effect returns early unless `relationReady()`.
    *   For a side with `relation.summary.removed[id] > 0`, `openTail` and the Data drawer pass the narrowing from "Statistics from the same reduction". The other Group's id is the other entry of `comparedIds()`.

#### 19. Tests (Create and Modify)

*   **Type / Scope**: Vitest.
*   **Proposed Changes**:
    *   **New, `src/lib/groups/tests/state/comparison.svelte.test.ts`:**
        *   `comparisonKey()` changes after `applyGroup` on a compared Group, and not after `renameGroup` or `recolorGroup`;
        *   a slower earlier `loadRelation` response is dropped;
        *   `relationReady()` is true at once for a single Group.
    *   **Updated:**
        *   `src/lib/tree/tests/utils/settings.test.ts` follows the new `treeKey` signature;
        *   the `comparison.svelte` mocks in `src/lib/tree/tests/state/variant-selection.svelte.test.ts` and `auto-build.svelte.test.ts` also export `comparisonKey` and `relationReady`.

### Phase 3: What the user sees

#### 20. `src/lib/groups/utils/comparison-note.ts` (Create)

*   **Type / Scope**: Pure TypeScript util.
*   **Proposed Changes**: Takes `groups: Group[]` (the ordered compared Groups) and `summary: ResponseRelation`, and returns the strings in "Copy":
    *   `comparisonSentence(groups, summary): string | null` returns `null` when no case was removed and no side has fewer than 5 kept cases;
    *   `relationCopy(groups, summary): string`;
    *   `refusalCopy(groups, summary): string`;
    *   `afterApplyCopy(groups, summary): string`.

#### 21. `src/lib/groups/components/comparison-note.svelte` and `src/lib/groups/components/comparison-refused.svelte` (Create)

*   **Type / Scope**: Svelte components.
*   **Proposed Changes**:
    *   `comparison-note.svelte` renders `comparisonSentence(comparedGroups(), relation.summary)` as a muted text line, or nothing.
    *   `comparison-refused.svelte` takes `project`. It renders `refusalCopy(...)`, or the `failed` message, together with a `CompareField`.

#### 22. Where the note and the refusal render (Modify)

*   **Type / Scope**: Svelte components and routes.
*   **Proposed Changes**:
    *   **`src/lib/tree/components/tree-toolbar.svelte`, `src/lib/dfg/components/dfg-toolbar.svelte`, `src/lib/statistics/components/statistics-view.svelte`:** render `<ComparisonNote />` under their controls.
    *   **`src/lib/statistics/components/statistics-view.svelte`:** also renders `comparison-refused.svelte` in place of its panes when the relation is ready and the status is not `ok`, or the state is `failed`.
    *   **`src/routes/app/projects/[id]/distributions/+page.svelte`:** renders `<ComparisonNote />` in its node header row, the `border-b` row with `node.label`. This is the only addition to that route.
    *   **`src/routes/app/projects/[id]/tree/+page.svelte`:** one branch beside the existing `AttributePrompt` branch renders `comparison-refused.svelte` in place of the canvas. This is the only addition to that route.
    *   **`src/routes/app/projects/[id]/dfg/+page.svelte`:** the same branch in place of the canvas.

#### 23. `src/lib/groups/components/compare-popover.svelte` (Modify)

*   **Type / Scope**: Svelte component.
*   **Proposed Changes**:
    *   **Removed:**
        *   the header paragraph "Overlap is reported, never removed...";
        *   `compareDifference`;
        *   the Difference Group button;
        *   the shared-cases block (lines 378-412);
        *   the `sharedCases`, `loadSharedCases`, `createGroup` and `applyGroup` imports.
    *   **When two Groups are picked,** an effect calls `comparisonRelation` for the pair, tagged with the pair's ids. A response for a different pair is dropped.
    *   **While loading,** the primary button is disabled and a skeleton shows.
    *   **With status `ok`,** it shows `relationCopy`, or the existing green line for `disjoint`.
    *   **Otherwise** it shows `refusalCopy` and keeps the button disabled.
    *   **Clicking a Saved Comparison row** (`compare(saved)`) awaits `comparisonRelation` first. A refused pair shows `refusalCopy` under the row and does not call `saveComparison`.

#### 24. Remove `shared_cases` (Modify and Delete)

*   **Type / Scope**: Rust command, invoker, state.
*   **Proposed Changes**:
    *   Deletes `shared_cases` from `src-tauri/src/groups/commands.rs` and unregisters it in `src-tauri/src/lib.rs`.
    *   Deletes `src/lib/groups/invokers/shared-cases.ts`.
    *   Removes `sharedCases`, `loadSharedCases` and `sharedCasesCache` from `src/lib/groups/state/groups.svelte.ts`.

#### 25. Note after Apply (Modify)

*   **Type / Scope**: Svelte state and route.
*   **Proposed Changes**:
    *   `src/lib/groups/state/comparison.svelte.ts` adds `checkAfterApply(project, group)`.
        *   It collects each two-Group Comparison naming `group.id`: `comparison.groupIds`, and each `savedComparisons` row of the project, without repeating a pair.
        *   It calls `comparisonRelation` for each one.
        *   For each status that is not `ok`, it calls `toast.warning(afterApplyCopy(...))` from `svelte-sonner`.
    *   `src/routes/app/projects/[id]/filters/+page.svelte` calls `checkAfterApply` after `applyGroup` resolves. This is the only addition to that route.

#### 26. Tests (Create)

*   **Type / Scope**: Vitest and WebdriverIO.
*   **Proposed Changes**:
    *   **`src/lib/groups/tests/utils/comparison-note.test.ts`:**
        *   each relation's sentence;
        *   the singular form;
        *   the skipped-tests clause;
        *   the identical and empty copy;
        *   `null` for a disjoint pair with no small side.
    *   **`src/lib/groups/tests/state/comparison.svelte.test.ts`** gains a `checkAfterApply` test: one toast per broken Comparison, none for valid ones, and no duplicate when the comparison in use is also saved.
    *   **`e2e/specs/disjoint-comparisons.e2e.ts`,** on the Sample Project:
        1. Compare Event Log with Approved through the `compare-groups` field, and assert the containment sentence.
        2. Apply Slow cases in Group Filters (the Sample Project ships it unapplied in `src/lib/sample-project/manifest.ts`), compare Approved with Slow cases, and assert the partial-overlap sentence.
        3. Compare Approved with Rejected again. Then edit Rejected in Group Filters to the Approved outcome filter and Apply. Assert the warning toast naming Approved vs Rejected.
    *   **`e2e/specs/saved-comparisons.e2e.ts`** runs unchanged.

### Phase 4: Documents

#### 27. `CONTEXT.md` (Modify)

*   **Type / Scope**: Domain glossary.
*   **Proposed Changes**:
    *   **Comparison:** "Two Groups selected to be measured against each other. No case is counted on both sides: when the Groups share cases, the shared cases are removed by a fixed rule (both lose them in a partial overlap; the outer Group loses them when one Group contains the other), and identical Groups cannot be compared. A Comparison of one Group is a description and carries no Significance Test."
    *   **Saved Comparison:** add "A Saved Comparison whose Groups have become identical cannot be compared."
    *   **Difference Group:** "Retired. Groups created this way before the change are ordinary Groups."
    *   **New terms, each with words to avoid:**
        *   **Shared cases:** "the cases whose case ID is in both Groups of a Comparison". Avoid: overlap cases, common cases.
        *   **Reduced side:** "a Group as a Comparison reads it, with the shared cases removed. The Group itself is unchanged." Avoid: complement, subset, trimmed Group.

#### 28. `docs/adr/0019-disjoint-comparisons-by-a-fixed-rule.md` (Create)

*   **Type / Scope**: ADR.
*   **Proposed Changes**:
    *   The rule, and the rationale from The Problem.
    *   Refusal when read, plus the note after Apply.
    *   The rejected Alternatives B (user-picked rule), C (larger side only), H (size refusal), J (Apply guard) and K (typed error).
    *   Supersedes the overlap premise of ADR 0006, amends ADR 0005 (comparison commands read a reduction of the Parquet), and amends ADR 0018 (no Difference Group writes `comparisons`).

#### 29. `docs/adr/0005-materialize-groups-to-parquet.md`, `docs/adr/0006-case-not-in-group-filter-kind.md`, `docs/adr/0018-saved-comparisons-beside-the-comparison.md` (Modify)

*   **Type / Scope**: ADR status lines.
*   **Proposed Changes**: One status line at the top of each, pointing to ADR 0019.

#### 30. `CLAUDE.md`, `src/lib/CLAUDE.md`, `src-tauri/CLAUDE.md` (Modify)

*   **Type / Scope**: Agent guides.
*   **Proposed Changes**:
    *   **Root `CLAUDE.md`:**
        *   The read-command list becomes `directed_tree`, `dfg`, `list_variants`, `node_distributions`, `group_comparison`, `group_stats` and `comparison_relation`.
        *   The sentence saying `analysis` "depends on nothing" gains: "In Rust, `analysis` reads Group files through `groups::storage`."
    *   **`src/lib/CLAUDE.md`:** the "Which Groups are compared" paragraph is rewritten to cover:
        *   the rule and `comparisonKey()`;
        *   `relation` and `relationReady()`;
        *   the note and the refusal view;
        *   removal of the Difference Group sentence and the stale `CompareDialog` mention.
    *   **`src-tauri/CLAUDE.md`:**
        *   The `analysis` row gains `reduction` (the rule, `plan`, `reduce`).
        *   The `statistics` row gains `comparison_relation`.
        *   The invoker list gains: "`groups/invokers/comparison-relation.ts` calls into `statistics/commands.rs`."

#### 31. Release notes (Create)

*   **Type / Scope**: GitHub release description for the version that ships this.
*   **Proposed Changes**: "Comparisons no longer count a case on both sides. When two compared groups share cases, the shared cases are removed, and every comparison view says how many. Comparisons whose groups share cases now show different numbers."

### Verification Plan

*   **After each phase:** `pnpm check`, `pnpm test` and `cargo test --manifest-path src-tauri/Cargo.toml`.
*   **Static analysis:** `cargo clippy --manifest-path src-tauri/Cargo.toml`.
*   **Build:** `pnpm build` and `cargo build --manifest-path src-tauri/Cargo.toml`, which also builds `bin/seed-project`.
*   **E2E:** after Phase 3, `pnpm e2e:build`, then `pnpm e2e`.
*   **Manual:** walk CUJs 1 to 10 on the Sample Project with `pnpm tauri dev`.

--------------------------------------------------------------------------------

<!-- Provenance: Indicates initial structural drafting via EGM. -->

*Drafted with EGM*

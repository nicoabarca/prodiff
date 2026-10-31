# Case Attributes are whole-case values taken from the Event Log

**Status:** Amends [ADR 0012](0012-materialize-custom-attributes-by-id.md), which left case aggregates to be decided.

A Custom Attribute now has a scope, fixed when it is created. An Event Attribute is computed row by row, as ADR 0012 describes. A Case Attribute is one number per case, built from the case's own data: case-scoped number columns, per-case aggregates of event-scoped number columns (`sum`, `mean`, `median`, `min`, `max`, `first`, `last`), `count()` and `duration()`.

**Computed once, on the Event Log, over whole cases.** Apply groups the Event Log by case id in one `group_by_stable(case).agg(...)` pass, which yields a lookup of one row per case. That lookup is left-joined by case id into the Event Log and into every applied Group's Parquet, keeping each file's row order. A Group never aggregates its own rows, so a case carries the same value in every file, and a Group whose Filter List kept only some of a case's events (a Trimmed Group) still carries the whole-case value.

**Why whole cases.** The questions this answers, such as cost per day of duration, describe a case. A numeric Filter on the attribute runs on the Event Log, so it selects cases by the whole-case value; storing a partial value in a Trimmed Group would let a Group keep a case for a value above 100 and then show it as 40. The column also behaves like an imported case-scoped column with `constant` resolution, which every view already reads one value per case.

**Rejected.**

- Computing on each Group's own rows, for chosen target Groups. The Original has no file of its own and could never be a target, the same name would give different values per Group, and Filters reading the attribute would have to run after every other Filter, against the order of the Filter List.
- Evaluating the case expression with `.over(case)` on each file's own rows. It is the smallest change, but it mixes whole-case and partial values in one column.
- A separate case-keyed file joined when a view reads a Group. Every read path would have to learn the join, which undoes ADR 0012's decision to materialize.

**Consequence.** A Trimmed Group shows a note wherever a Case Attribute is shown for it. `duration()` uses the earliest and latest timestamps of the whole case, so a Duration Filter placed after a trimming Filter can measure a shorter span than `duration()` does.

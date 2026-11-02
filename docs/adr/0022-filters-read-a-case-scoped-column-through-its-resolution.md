# Filters read a case-scoped column through its resolution

**Status:** Accepted.

A case-scoped column means one value per case, chosen by its resolution, and every view reads it that way. Attribute and numeric Filters did not: they matched a case when any event held the value. A column whose raw values move within a case then put one case on both sides of a threshold. On the Road Traffic Fine log, `amount` under `first` resolution doubles on Add penalty, so Groups below and above 50 shared 56,590 cases, and a Comparison removed those as Shared cases without any of them being ambiguous under the mapping.

**The rule.** An attribute or numeric Filter on a case-scoped column tests the case's resolved value: the first non-empty value for `first` and `constant`, the last for `last`. On an event-scoped column it still matches when one event does. Timeframe, endpoint and duration Filters read the activity and timestamp columns, and the follower editor offers only event-scoped columns, so they are unchanged. The attribute picker offers a case-scoped column's resolved values, so it never lists a value no case can match.

**`keep_selected` on a case-scoped column keeps or drops the whole case**, the same as `mandatory`. Filtering rows would let the Filter change the value it just tested: keeping the rows holding a case's later value makes that value its first. Such a Filter therefore does not make a Group a Trimmed Group.

**A case with no value matches nothing**, so `forbidden` keeps it, as it did before.

**A resolved value is read from the previous Filter's output.** A Filter List is a pipeline, and the views read a Trimmed Group's case-scoped columns from its own rows, so a numeric Filter after a `trim` sees the first value the trim left. Case Attributes differ: they are whole-case values from the Event Log (ADR 0020).

**Rejected.**

- Resolving once on the whole Event Log and joining the value in, as Case Attributes do. Imported case-scoped columns are read from each Group's rows everywhere else, so a Filter would disagree with the value the views show for the same case.
- Hiding `keep_selected` for case-scoped columns. Saved Filter Lists and study bundles can already hold it, so it needs a meaning regardless.

**Consequence.** A Group's Parquet is written only by Apply, so a Group applied before this rule keeps its old cases until it is applied again.

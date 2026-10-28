# Remove Shared cases from a Comparison by a fixed rule, applied when Groups are read

**Status:** Accepted. Supersedes the overlap premise of [ADR 0006](0006-case-not-in-group-filter-kind.md); amends [ADR 0005](0005-materialize-groups-to-parquet.md) and [ADR 0018](0018-saved-comparisons-beside-the-comparison.md). Design: `docs/designs/disjoint-comparisons.md`.

Every Significance Test the app runs assumes its two samples are independent. A case in both compared Groups contributes the same observations to both samples, so the p-values and effect sizes no longer have their stated meaning; how far off they are, and in which direction, depends on how many cases are shared. The app used to report the overlap and offer a Difference Group, which the user could skip, and which kept the first Group whole in every case. The most common Comparison, a Group against the whole Event Log, always overlaps.

**The rule.** For two Groups A and B:

- disjoint: both are compared as they are;
- partial overlap: both lose the Shared cases;
- one inside the other: the inner Group stays whole and the outer one loses its cases;
- identical case sets, or a Group with no cases: refused.

Cases are removed whole, never event by event, so no trace is cut. A null case ID belongs to no case and is never shared. Nothing about the rule is stored.

**Where it runs.** `analysis::reduction` holds the rule, and `read_groups` applies it to every two-Group request, so all five comparison commands get it whatever view or Saved Comparison called them. `comparison_relation` returns the same classification as data; the views wait on it before they build and show a refusal in place of their canvas. The commands keep `String` errors, because a refusal never has to travel as one.

**Telling the user.** Every comparison view shows one always-visible sentence naming both Groups and how many cases were removed from which side, and whose tests were skipped below 5 cases. After an Apply in Group Filters, a non-blocking note names any Comparison that can no longer be compared.

**Rejected.**

- Letting the user pick the resolution of a partial overlap needed the choice stored on `comparisons` and `saved_comparisons`, a migration, a change to Saved Comparison identity, and rules for when a stored choice stops fitting. A Group with a `case_not_in_group` Filter gives the same outcome.
- Removing the Shared cases from the larger Group only makes the meaning depend on relative size, which an edit can flip without either Group's definition changing much.
- Refusing a side under 5 cases duplicates the per-test gates and would put existing small comparisons behind a refusal.
- Blocking an Apply that would invalidate a Comparison adds a dialog and blocks unrelated edits of a pair that was already invalid, while a Custom Attribute re-apply goes around it anyway.
- A typed error for refusals would have changed `off_main_thread` and six commands.

**Consequence:** comparisons whose Groups share cases show different numbers after this change, and say so on screen. Per-event values within one case still repeat, so disjoint sides make cases independent, not every event.

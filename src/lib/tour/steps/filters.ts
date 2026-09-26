import { groups } from "$lib/groups/state/groups.svelte";
import { SAMPLE_GROUPS } from "$lib/sample-project/manifest";
import type { TourStep } from "$lib/tour/types";

const approved = { anchor: "group-card", key: SAMPLE_GROUPS.approved };
const slowCases = { anchor: "group-card", key: SAMPLE_GROUPS.slowCases };

/** Whether Slow cases has been applied. A renamed or deleted one no longer holds the Tour up. */
function slowCasesApplied(): boolean {
  const group = groups.find((candidate) => candidate.name === SAMPLE_GROUPS.slowCases);
  return !group || group.stats !== null;
}

export const filtersTour: TourStep[] = [
  {
    target: [approved],
    title: "Groups",
    body: "A Group is the set of cases its filters carve out of the event log. This sample starts with three: Approved, Rejected and Slow cases.",
    side: "right"
  },
  {
    target: [approved, { anchor: "filter-step" }],
    title: "Filters run in order",
    body: "Each filter works on the result of the one above it. The bar shows how many of those cases it keeps.",
    side: "bottom"
  },
  {
    target: [{ anchor: "filter-editor" }],
    title: "The filter editor",
    body: "Add a filter to a Group, or click one to edit it here. Edits stay a draft until you apply them, so you can try things freely.",
    side: "left"
  },
  {
    target: [slowCases],
    title: "A Group not applied yet",
    body: "Slow cases keeps the applications that took more than 12 days. Its filter is set, but the Group holds no cases until it is applied.",
    side: "right"
  },
  {
    target: [slowCases, { anchor: "apply-group" }],
    title: "Apply it",
    body: "Press Apply filters. The tour continues once the Group is ready.",
    side: "top",
    until: slowCasesApplied
  },
  {
    target: [{ anchor: "nav-tree" }],
    title: "Next: compare Groups",
    body: "Open the Directed Rooted Tree to see where Approved and Rejected applications part ways.",
    side: "right",
    interactive: true
  }
];

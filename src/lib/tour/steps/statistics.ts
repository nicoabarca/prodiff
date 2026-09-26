import type { TourStep } from "$lib/tour/types";

export const statisticsTour: TourStep[] = [
  {
    target: [{ anchor: "comparison-charts" }],
    title: "Groups side by side",
    body: "Each Group is summarized next to the whole event log: how many cases it holds, how many variants they follow and how long they take.",
    side: "bottom"
  },
  {
    target: [{ anchor: "metrics-table" }],
    title: "The figures",
    body: "The same figures as a table. Compare how long Approved and Rejected applications take from start to end.",
    side: "top"
  },
  {
    target: [{ anchor: "event-data-table" }],
    title: "The events",
    body: "Every event of the log, one row each, with the columns of the uploaded file.",
    side: "top"
  },
  {
    target: [{ anchor: "nav-filters" }],
    title: "Next: Filters",
    body: "Groups are made in the Filters view. Open it to see how Approved, Rejected and Slow cases are defined.",
    side: "right",
    interactive: true
  }
];

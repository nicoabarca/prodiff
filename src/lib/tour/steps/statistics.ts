import type { TourStep } from "$lib/tour/types";

export const statisticsTour: TourStep[] = [
  {
    target: [{ anchor: "statistics-compare" }],
    title: "Two sides",
    body: "Pick the two sides to compare: the whole event log or any applied Group. Every figure below reads the second against the first.",
    side: "bottom"
  },
  {
    target: [{ anchor: "statistics-panes" }],
    title: "One question per pane",
    body: "Overview ranks the biggest differences. The other panes answer one question each: how long cases take, which activities they touch, which attributes differ and which paths they follow.",
    side: "right"
  },
  {
    target: [{ anchor: "statistics-data" }],
    title: "The events",
    body: "Every event of the log, one row each, a pull away. Which columns show is set in the Event log view.",
    side: "top"
  },
  {
    target: [{ anchor: "nav-filters" }],
    title: "Next: Group Filters",
    body: "Groups are made in the Group Filters view. Open it to see how Approved, Rejected and Slow cases are defined.",
    side: "right",
    interactive: true
  }
];

import { tests } from "$lib/dfg/state/view.svelte";
import type { TourStep } from "$lib/tour/types";

const requestDocuments = { anchor: "dfg-node", key: "Request documents" };

export const dfgTour: TourStep[] = [
  {
    target: [requestDocuments],
    title: "One node per activity",
    body: "Unlike the tree, each activity appears once, however many traces reach it. Receive documents leads back to Request documents: the loop rejected applications go through.",
    side: "right"
  },
  {
    target: [{ anchor: "dfg-variants" }],
    title: "Simplify",
    body: "Open Variants to keep the common variants and the busiest transitions. Apply rebuilds the graph, so every test describes what is drawn.",
    side: "bottom"
  },
  {
    target: [{ anchor: "dfg-tests" }],
    title: "Where the groups differ",
    body: "Open Tests to see every Significance Test the graph carries.",
    side: "bottom",
    until: () => tests.open
  },
  {
    target: [{ anchor: "dfg-tests-panel" }],
    title: "Tests by attribute",
    body: "Each attribute says at how many activities or edges it differs. Open one to list them, and open an activity or edge to frame it on the graph.",
    side: "left"
  },
  {
    title: "That's the tour",
    body: "You have seen every view. Create a project from your own event log whenever you are ready, and reopen any tour with the question mark in the top bar."
  }
];

import { selected } from "$lib/dfg/state/view.svelte";
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
    target: [{ anchor: "simplification-controls" }],
    title: "Simplify",
    body: "Trim rare activities and transitions so the main flow stands out. The graph is not rebuilt, only redrawn.",
    side: "left"
  },
  {
    target: [requestDocuments],
    title: "Pick an activity",
    body: "Click Request documents to see what each Group does there.",
    side: "right",
    until: () => selected.id !== null
  },
  {
    target: [{ anchor: "dfg-detail-panel" }],
    title: "The activity in detail",
    body: "How each Group reaches this activity and where it goes next, side by side.",
    side: "left"
  },
  {
    title: "That's the tour",
    body: "You have seen every view. Create a project from your own event log whenever you are ready, and reopen any tour with the question mark in the top bar."
  }
];

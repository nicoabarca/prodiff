import { selected } from "$lib/tree/state/tree.svelte";
import type { TourStep } from "$lib/tour/types";

/** The tree node for Request documents, reached through Submit application and Check completeness. */
const REQUEST_DOCUMENTS = "Start/Submit application/Check completeness/Request documents";

export const treeTour: TourStep[] = [
  {
    target: [{ anchor: "compare-groups" }],
    title: "What is compared",
    body: "The tree compares Approved with Rejected. Pick other Groups here at any time.",
    side: "bottom"
  },
  {
    target: [{ anchor: "tree-canvas" }],
    title: "The Directed Rooted Tree",
    body: "Every case starts at Start and follows its trace down, one step per level. A path only one Group follows takes that Group's colour.",
    side: "left"
  },
  {
    target: [{ anchor: "tree-node", key: REQUEST_DOCUMENTS }],
    title: "Pick a step",
    body: "Click Request documents. Most rejected applications pass through it, most approved ones do not.",
    side: "right",
    until: () => selected.id !== null
  },
  {
    target: [{ anchor: "tree-detail-panel" }],
    title: "Where the Groups differ",
    body: "For the cases at this step, each attribute is tested for a difference between the Groups, the clearest findings first.",
    side: "left"
  },
  {
    target: [{ anchor: "open-distributions" }],
    title: "Next: Distributions",
    body: "Open Distributions to see how each attribute's values split between the Groups at this step.",
    side: "bottom",
    interactive: true
  }
];

import type { TourStep } from "$lib/tour/types";

export const distributionsTour: TourStep[] = [
  {
    target: [{ anchor: "distribution-grid" }],
    title: "One chart per attribute",
    body: "Each chart shows how an attribute's values split between the Groups at this step, the biggest difference first.",
    side: "top"
  },
  {
    target: [{ anchor: "distribution-scope" }],
    title: "This step or the whole case",
    body: "Count only the event at this step, or every event of the same cases. The cases stay the same either way.",
    side: "bottom"
  },
  {
    target: [{ anchor: "distribution-trace" }],
    title: "Move along the trace",
    body: "Click another step of the trace to see its distributions.",
    side: "right"
  },
  {
    target: [{ anchor: "nav-dfg" }],
    title: "Next: Directly-Follows Graph",
    body: "See every transition between activities at once, including the loop rejected applications go through.",
    side: "right",
    interactive: true
  }
];

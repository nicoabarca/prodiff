import { describe, expect, it } from "vitest";
import {
  CROSSING_MINIMIZATIONS,
  CYCLE_BREAKINGS,
  EDGE_ROUTINGS,
  LAYERINGS,
  MODEL_ORDERS,
  NODE_PLACEMENTS
} from "$lib/dev-elk/types";
import { defaultElkTunings, elkOptions } from "$lib/dev-elk/utils/elk-options";
import { END_ID, START_ID } from "$lib/dfg/types";
import { COMPACT, SPAGHETTI, layout } from "$lib/dfg/utils/layout";
import type { Simplified } from "$lib/dfg/utils/simplify";

const ACTIVITY_ID = 2;
const tuning = defaultElkTunings.compact;

const graph: Simplified = {
  nodes: [
    { id: START_ID, label: "Start", kind: "start", counts: { a: { cases: 3, events: 3 } } },
    { id: ACTIVITY_ID, label: "A", kind: "activity", counts: { a: { cases: 3, events: 3 } } },
    { id: END_ID, label: "End", kind: "end", counts: { a: { cases: 3, events: 3 } } }
  ],
  edges: [
    { source: START_ID, target: ACTIVITY_ID, counts: { a: { cases: 3, events: 3 } } },
    { source: ACTIVITY_ID, target: END_ID, counts: { a: { cases: 3, events: 3 } } }
  ],
  variants: { shown: 1, total: 1, cases: 3, totalCases: 3 },
  activities: { shown: 1, total: 1 },
  paths: { shown: 2, total: 2 }
};

describe("defaultElkTunings", () => {
  it("starts each tier from the spacing ELK lays out with today", () => {
    expect(defaultElkTunings.compact).toMatchObject(COMPACT);
    expect(defaultElkTunings.spaghetti).toMatchObject(SPAGHETTI);
  });
});

describe("elkOptions", () => {
  it("maps the tuning onto ELK option ids as strings", () => {
    const options = elkOptions({ ...tuning, nodeNode: 42, mergeEdges: true });
    expect(options["elk.spacing.nodeNode"]).toBe("42");
    expect(options["elk.layered.mergeEdges"]).toBe("true");
  });

  it("changes the layout when laid over the tier", async () => {
    const tight = await layout(
      graph,
      "TB",
      "cases",
      elkOptions({ ...tuning, nodeNodeBetweenLayers: 10 })
    );
    const loose = await layout(
      graph,
      "TB",
      "cases",
      elkOptions({ ...tuning, nodeNodeBetweenLayers: 300 })
    );
    expect(loose.nodes.get(END_ID)!.y).toBeGreaterThan(tight.nodes.get(END_ID)!.y);
  });

  it("lays out under every offered strategy", async () => {
    const variants = [
      ...EDGE_ROUTINGS.map((edgeRouting) => ({ edgeRouting })),
      ...CROSSING_MINIMIZATIONS.map((crossingMinimization) => ({ crossingMinimization })),
      ...NODE_PLACEMENTS.map((nodePlacement) => ({ nodePlacement })),
      ...LAYERINGS.map((layering) => ({ layering })),
      ...CYCLE_BREAKINGS.map((cycleBreaking) => ({ cycleBreaking })),
      ...MODEL_ORDERS.map((considerModelOrder) => ({ considerModelOrder }))
    ];
    for (const variant of variants) {
      const placement = await layout(graph, "LR", "cases", elkOptions({ ...tuning, ...variant }));
      expect(placement.nodes.size, JSON.stringify(variant)).toBe(3);
    }
  });
});

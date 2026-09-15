import { describe, expect, it } from "vitest";
import { END_ID, START_ID } from "$lib/dfg/types";
import { edgeKey, isTerminal, nodeSize } from "$lib/dfg/utils/layout";
import { layoutGraphviz } from "$lib/dfg/utils/layout-graphviz";
import type { Simplified } from "$lib/dfg/utils/simplify";

const ACTIVITY_ID = 2;

const graph: Simplified = {
  nodes: [
    { id: START_ID, label: "Start", kind: "start", counts: { a: { cases: 3, events: 3 } } },
    { id: ACTIVITY_ID, label: "A", kind: "activity", counts: { a: { cases: 3, events: 3 } } },
    { id: END_ID, label: "End", kind: "end", counts: { a: { cases: 3, events: 3 } } }
  ],
  edges: [
    { source: START_ID, target: ACTIVITY_ID, counts: { a: { cases: 3, events: 3 } } },
    { source: ACTIVITY_ID, target: END_ID, counts: { a: { cases: 3, events: 3 } } },
    { source: ACTIVITY_ID, target: ACTIVITY_ID, counts: { a: { cases: 1, events: 1 } } }
  ],
  variants: { shown: 1, total: 1, cases: 3, totalCases: 3 },
  activities: { shown: 1, total: 1 },
  paths: { shown: 3, total: 3 }
};

describe("layoutGraphviz", () => {
  it("places every node and routes every non-loop edge", async () => {
    const placement = await layoutGraphviz(graph, "LR", "cases");

    for (const node of graph.nodes) expect(placement.nodes.has(node.id)).toBe(true);
    expect(placement.routes.has(edgeKey(START_ID, ACTIVITY_ID))).toBe(true);
    expect(placement.routes.has(edgeKey(ACTIVITY_ID, END_ID))).toBe(true);
  });

  it("keeps Start left of End on a left-to-right layout", async () => {
    const placement = await layoutGraphviz(graph, "LR", "cases");
    const start = placement.nodes.get(START_ID);
    const end = placement.nodes.get(END_ID);
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect(start!.x).toBeLessThan(end!.x);
  });

  it("routes a self-loop the same way layout.ts does, beside its own node", async () => {
    const placement = await layoutGraphviz(graph, "LR", "cases");
    const corner = placement.nodes.get(ACTIVITY_ID)!;
    const { width, height } = nodeSize(ACTIVITY_ID);
    const loop = placement.routes.get(edgeKey(ACTIVITY_ID, ACTIVITY_ID));

    expect(loop).toBeDefined();
    for (const point of loop!) {
      expect(point.y).toBeGreaterThanOrEqual(corner.y);
      expect(point.y).toBeLessThanOrEqual(corner.y + height + 40);
      expect(point.x).toBeGreaterThanOrEqual(corner.x - 8);
      expect(point.x).toBeLessThanOrEqual(corner.x + width + 8);
    }
  });

  it("sizes terminal nodes smaller than activity nodes, matching nodeSize", () => {
    expect(isTerminal(START_ID)).toBe(true);
    expect(isTerminal(END_ID)).toBe(true);
    expect(isTerminal(ACTIVITY_ID)).toBe(false);
  });
});

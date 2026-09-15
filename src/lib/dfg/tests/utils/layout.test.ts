import { describe, expect, it } from "vitest";
import { END_ID, START_ID, type Rect } from "$lib/dfg/types";
import { tierFor, straightRoute } from "$lib/dfg/utils/layout";
import type { Simplified } from "$lib/dfg/utils/simplify";

const noCounts = { a: { cases: 1, events: 1 } };

/** A chain Start -> 1 -> 2 -> ... -> activities -> End, plus `extraEdges`
 * more Start->End edges so edge count can be pushed independently of node
 * count. */
function chain(activities: number, extraEdges = 0): Simplified {
  const nodes = [
    { id: START_ID, label: "Start", kind: "start" as const, counts: noCounts },
    ...Array.from({ length: activities }, (_, i) => ({
      id: i + 2,
      label: `A${i}`,
      kind: "activity" as const,
      counts: noCounts
    })),
    { id: END_ID, label: "End", kind: "end" as const, counts: noCounts }
  ];
  const ids = [START_ID, ...nodes.slice(1, -1).map((node) => node.id), END_ID];
  const edges = ids
    .slice(0, -1)
    .map((source, i) => ({ source, target: ids[i + 1], counts: noCounts }));
  for (let i = 0; i < extraEdges; i++) {
    edges.push({ source: START_ID, target: END_ID, counts: noCounts });
  }
  return {
    nodes,
    edges,
    variants: { shown: 1, total: 1, cases: 1, totalCases: 1 },
    activities: { shown: activities, total: activities },
    paths: { shown: edges.length, total: edges.length }
  };
}

const source: Rect = { x: 10, y: 20, width: 150, height: 58 };
const target: Rect = { x: 210, y: 160, width: 150, height: 58 };

describe("straightRoute", () => {
  it("connects the same handles as a top-down node", () => {
    expect(straightRoute(source, target, "TB")).toEqual([
      { x: 85, y: 78 },
      { x: 285, y: 160 }
    ]);
  });

  it("connects the same handles as a left-to-right node", () => {
    expect(straightRoute(source, target, "LR")).toEqual([
      { x: 160, y: 49 },
      { x: 210, y: 189 }
    ]);
  });

  it("leaves an edge absent only when one endpoint is absent", () => {
    expect(straightRoute(source, null, "TB")).toEqual([]);
  });
});

describe("tierFor", () => {
  it("agrees on the same compact tier for a small graph, whichever profile is asked", () => {
    const small = chain(5);
    expect(tierFor(small, "elk1")).toEqual(tierFor(small, "elk2"));
    expect(tierFor(small, "elk1").edgeRouting).toBe("SPLINES");
  });

  it("diverges once activities pile up: elk1 goes polyline, elk2 stays splined but wider", () => {
    const spaghetti = chain(35);
    const elk1 = tierFor(spaghetti, "elk1");
    const elk2 = tierFor(spaghetti, "elk2");

    expect(elk1.edgeRouting).toBe("POLYLINE");
    expect(elk1.nodeNodeBetweenLayers).toBeGreaterThan(80);

    expect(elk2.edgeRouting).toBe("SPLINES");
    expect(elk2.edgeEdge).toBeGreaterThan(20);
  });

  it("diverges on edge density alone, even with few activities", () => {
    const dense = chain(3, 65);
    expect(tierFor(dense, "elk1").edgeRouting).toBe("POLYLINE");
    expect(tierFor(dense, "elk2").edgeRouting).toBe("SPLINES");
    expect(tierFor(dense, "elk2").edgeEdge).toBeGreaterThan(tierFor(dense, "elk1").edgeEdge);
  });
});

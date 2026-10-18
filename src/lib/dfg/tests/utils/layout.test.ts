import { describe, expect, it } from "vitest";
import { END_ID, START_ID, type Rect } from "$lib/dfg/types";
import { nearest, prepareRoute } from "$lib/dfg/utils/arrow";
import { edgeId, fold } from "$lib/dfg/utils/fold";
import { layout, straightRoute } from "$lib/dfg/utils/layout";
import type { Simplified } from "$lib/dfg/utils/simplify";

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

describe("layout labels", () => {
  const [A, B, C] = [2, 3, 4];
  const folded = fold([
    { activities: [A, B, C], cases: { a: 5 } },
    { activities: [A, C, B], cases: { a: 2 } },
    { activities: [A, A, C], cases: { a: 1 } }
  ]);
  const graph: Simplified = {
    nodes: [...folded.nodes.entries()].map(([id, counts]) => ({
      id,
      label: String(id),
      kind: id === START_ID ? "start" : id === END_ID ? "end" : "activity",
      counts
    })),
    edges: folded.edges,
    variants: { shown: 3, total: 3, cases: 8, totalCases: 8, keys: new Set() },
    activities: { shown: 3, total: 3 },
    paths: { shown: folded.edges.length, total: folded.edges.length }
  };
  const size = { width: 40, height: 30 };
  const sizes = new Map(folded.edges.map((edge) => [edgeId(edge.source, edge.target), size]));

  it("places every label, self-loops included", async () => {
    const placed = await layout(graph, "TB", "cases", sizes);

    expect([...placed.labels.keys()].sort()).toEqual([...sizes.keys()].sort());
    const spots = new Set([...placed.labels.values()].map(({ x, y }) => `${x},${y}`));
    expect(spots.size).toBe(sizes.size);
  });

  it("reserves each label's room right beside its own edge", async () => {
    const placed = await layout(graph, "LR", "cases", sizes);

    for (const edge of folded.edges) {
      if (edge.source === edge.target) continue;
      const key = edgeId(edge.source, edge.target);
      const centre = placed.labels.get(key)!;
      const on = nearest(prepareRoute(placed.routes.get(key)!), centre);
      expect(Math.hypot(on.x - centre.x, on.y - centre.y)).toBeLessThan(size.width);
    }
  });
});

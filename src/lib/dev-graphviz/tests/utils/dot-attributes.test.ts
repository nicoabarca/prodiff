import { describe, expect, it } from "vitest";
import { defaultGraphvizTunings } from "$lib/dev-graphviz/types";
import { dotAttributes } from "$lib/dev-graphviz/utils/dot-attributes";
import { END_ID, START_ID } from "$lib/dfg/types";
import { dotSource, layoutGraphviz } from "$lib/dfg/utils/layout-graphviz";
import type { Simplified } from "$lib/dfg/utils/simplify";

const ACTIVITY_ID = 2;
const tuning = defaultGraphvizTunings.compact;

const graph: Simplified = {
  nodes: [
    { id: START_ID, label: "Start", kind: "start", counts: { a: { cases: 100, events: 100 } } },
    { id: ACTIVITY_ID, label: "A", kind: "activity", counts: { a: { cases: 100, events: 100 } } },
    { id: END_ID, label: "End", kind: "end", counts: { a: { cases: 100, events: 100 } } }
  ],
  edges: [
    { source: START_ID, target: ACTIVITY_ID, counts: { a: { cases: 100, events: 100 } } },
    { source: ACTIVITY_ID, target: END_ID, counts: { a: { cases: 1, events: 1 } } }
  ],
  variants: { shown: 1, total: 1, cases: 100, totalCases: 100 },
  activities: { shown: 1, total: 1 },
  paths: { shown: 2, total: 2 }
};

describe("dotAttributes", () => {
  it("writes the tuning's graph attributes, spacing in inches", () => {
    const dot = dotSource(
      graph,
      "TB",
      "cases",
      dotAttributes({
        ...tuning,
        splines: "ortho",
        nodesep: 72,
        concentrate: true,
        ordering: "out"
      })
    );
    expect(dot).toContain('splines="ortho";');
    expect(dot).toContain('nodesep="1.0000";');
    expect(dot).toContain('concentrate="true";');
    expect(dot).toContain('ordering="out";');
    expect(dot).not.toContain("newrank");
  });

  it("drops the terminal ranks and the labels when asked", () => {
    const dot = dotSource(
      graph,
      "TB",
      "cases",
      dotAttributes({ ...tuning, pinTerminals: false, edgeLabels: "none" })
    );
    expect(dot).not.toContain("rank=source");
    expect(dot).not.toMatch(/->.*label=/);
  });

  it("scales the edge weight by the chosen mode", () => {
    const edge = (weight: typeof tuning.weight) =>
      dotAttributes({ ...tuning, weight }).edge(100, 100).weight;
    expect(edge("count")).toBe("100");
    expect(edge("log")).toBe("7");
    expect(edge("flat")).toBe("1");
  });

  it("frees edges below the looseBelow share of the busiest edge", () => {
    const dot = dotSource(graph, "TB", "cases", dotAttributes({ ...tuning, looseBelow: 0.05 }));
    expect(dot).toMatch(/n2 -> n1 \[[^\]]*constraint="false"/);
    expect(dot).not.toMatch(/n0 -> n2 \[[^\]]*constraint="false"/);
  });

  it("lays out under every splines mode, with and without concentrate", async () => {
    for (const splines of ["spline", "polyline", "ortho", "curved", "line"] as const) {
      for (const concentrate of [false, true]) {
        const placement = await layoutGraphviz(
          graph,
          "TB",
          "cases",
          dotAttributes({ ...tuning, splines, concentrate })
        );
        for (const node of graph.nodes) expect(placement.nodes.has(node.id)).toBe(true);
      }
    }
  });
});

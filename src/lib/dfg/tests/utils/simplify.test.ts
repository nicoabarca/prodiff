import { describe, expect, it } from "vitest";
import type { DfgEdge, DfgNode, ResponseDfg } from "$lib/dfg/invokers/types";
import { defaultDfgView, type DfgView } from "$lib/dfg/types";
import { simplify } from "$lib/dfg/utils/simplify";

function node(id: number, significance = 1, label = `n${id}`): DfgNode {
  return {
    id,
    label,
    kind: id === 0 ? "start" : id === 1 ? "end" : "activity",
    significance,
    counts: {},
    attributes: {}
  };
}

function edge(source: number, target: number, significance = 1, correlation = 1): DfgEdge {
  return { source, target, significance, correlation, counts: {}, transitionTime: null };
}

function graph(nodes: DfgNode[], edges: DfgEdge[]): ResponseDfg {
  return {
    nodes,
    edges,
    groups: [{ id: "a", caseCount: 1 }],
    comparing: false,
    overlapCases: 0,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false,
    skippedCaseLevel: []
  };
}

const view = (over: Partial<DfgView> = {}): DfgView => ({ ...defaultDfgView, ...over });

const pairs = (edges: { source: number; target: number }[]) =>
  edges.map((e) => `${e.source}->${e.target}`).sort();

describe("conflicting pairs", () => {
  /** Start → 2 ⇄ 3 → End, the two directions evenly matched. */
  const conflicted = graph(
    [node(0), node(1), node(2), node(3)],
    [edge(0, 2), edge(2, 3), edge(3, 2), edge(3, 1)]
  );

  it("drops both directions when neither is the exception", () => {
    const { edges } = simplify(conflicted, view({ edgeCutoff: 0 }));
    expect(pairs(edges)).toEqual(["0->2", "3->1"]);
  });

  it("leaves a self-loop alone", () => {
    const looped = graph([node(0), node(1), node(2)], [edge(0, 2), edge(2, 2), edge(2, 1)]);
    const { edges } = simplify(looped, view({ edgeCutoff: 0 }));
    expect(pairs(edges)).toContain("2->2");
  });

  it("keeps both when each direction dominates its own ends", () => {
    // 2 ⇄ 3 and nothing else: every edge is its source's only way out and its
    // target's only way in, so both sides score 1.
    const loop = graph([node(2), node(3)], [edge(2, 3), edge(3, 2)]);
    const { edges } = simplify(loop, view({ edgeCutoff: 0 }));
    expect(pairs(edges)).toEqual(["2->3", "3->2"]);
  });
});

describe("the edge cutoff", () => {
  /** 2 forks into 3 and 4, and neither has another way in. */
  const forked = graph(
    [node(0), node(1), node(2), node(3), node(4)],
    [edge(0, 2), edge(2, 3, 1.0, 1.0), edge(2, 4, 0.1, 0.1), edge(3, 1), edge(4, 1)]
  );

  /**
   * A diamond, so no edge is anyone's only way in or only way out and the
   * ranking is free to drop one. The frequent edges are 2->4 and 3->5; the
   * close ones are 3->4 and 2->5.
   */
  const diamond = graph(
    [node(2), node(3), node(4), node(5)],
    [edge(2, 4, 1.0, 0.0), edge(3, 4, 0.1, 1.0), edge(2, 5, 0.1, 1.0), edge(3, 5, 1.0, 0.0)]
  );

  it("keeps every edge at a cutoff of zero", () => {
    expect(simplify(forked, view({ edgeCutoff: 0 })).edges).toHaveLength(5);
    expect(simplify(diamond, view({ edgeCutoff: 0 })).edges).toHaveLength(4);
  });

  it("drops an edge only once both of its ends rank it last", () => {
    const { edges } = simplify(diamond, view({ edgeCutoff: 0.5, utilityRatio: 1 }));
    expect(pairs(edges)).toEqual(["2->4", "3->5"]);
  });

  it("keeps an edge the source gave up on when the target still needs it", () => {
    // 2 ranks its weak branch last and drops it, but 4 has no other way in and
    // normalizes its one edge to 1. That is why the graph never comes apart.
    const { edges } = simplify(forked, view({ edgeCutoff: 1, utilityRatio: 1 }));
    expect(pairs(edges)).toContain("2->4");
    expect(pairs(edges)).toContain("4->1");
  });

  it("keeps the frequent edges at a ratio of one", () => {
    const { edges } = simplify(diamond, view({ edgeCutoff: 1, utilityRatio: 1 }));
    expect(pairs(edges)).toEqual(["2->4", "3->5"]);
  });

  it("keeps the close ones instead at a ratio of zero", () => {
    const { edges } = simplify(diamond, view({ edgeCutoff: 1, utilityRatio: 0 }));
    expect(pairs(edges)).toEqual(["2->5", "3->4"]);
  });
});

describe("the node cutoff", () => {
  /** Start → 2 → 3 → 4 → End, with 3 the least significant. */
  const chain = graph(
    [node(0), node(1), node(2, 1), node(3, 0.1), node(4, 1)],
    [edge(0, 2), edge(2, 3), edge(3, 4), edge(4, 1)]
  );

  it("removes nothing at a cutoff of zero", () => {
    const { nodes } = simplify(chain, view({ edgeCutoff: 0 }));
    expect(nodes).toHaveLength(5);
  });

  it("reconnects the flow around what it removes", () => {
    const { nodes, edges } = simplify(chain, view({ edgeCutoff: 0, nodeCutoff: 0.5 }));
    expect(nodes.map((n) => n.id)).toEqual([0, 1, 2, 4]);
    expect(pairs(edges)).toEqual(["0->2", "2->4", "4->1"]);
  });

  it("gives a reconnection no figures, because that pair never happened", () => {
    const { edges } = simplify(chain, view({ edgeCutoff: 0, nodeCutoff: 0.5 }));
    const stand_in = edges.find((e) => e.source === 2 && e.target === 4);
    expect(stand_in?.edge).toBeNull();
    expect(edges.find((e) => e.source === 0)?.edge).not.toBeNull();
  });

  it("never removes Start or End, whatever the cutoff", () => {
    const faint = graph(
      [node(0), node(1), node(2, 0.5), node(3, 0.5)],
      [edge(0, 2), edge(2, 3), edge(3, 1)]
    );
    const { nodes } = simplify(faint, view({ edgeCutoff: 0, nodeCutoff: 1 }));
    expect(nodes.map((n) => n.kind)).toEqual(["start", "end"]);
  });

  it("carries the flow across a run of removed nodes", () => {
    const run = graph(
      [node(2, 1), node(3, 0.1), node(4, 0.1), node(5, 1)],
      [edge(2, 3), edge(3, 4), edge(4, 5)]
    );
    const { nodes, edges } = simplify(run, view({ edgeCutoff: 0, nodeCutoff: 0.5 }));
    expect(nodes.map((n) => n.id)).toEqual([2, 5]);
    expect(pairs(edges)).toEqual(["2->5"]);
  });

  it("does not invent a self-loop when removing the node between a pair", () => {
    const there_and_back = graph(
      [node(2, 1), node(3, 0.1)],
      [edge(2, 3), edge(3, 2)]
    );
    const { edges } = simplify(there_and_back, view({ edgeCutoff: 0, nodeCutoff: 0.5 }));
    expect(edges).toEqual([]);
  });
});

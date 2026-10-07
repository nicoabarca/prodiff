import { describe, expect, it } from "vitest";
import { dfgSummary, findNode, plainSimplified } from "$lib/devtools/dfg/utils/inspect";
import type { DfgNode, ResponseDfg } from "$lib/dfg/invokers/types";
import type { Simplified } from "$lib/dfg/utils/simplify";

const WAIT = { summaries: {}, test: null };

function node(id: number, label: string): DfgNode {
  return { id, label, counts: { original: { cases: 1, events: 1 } }, attributes: {} };
}

const graph: ResponseDfg = {
  nodes: [node(2, "Register"), node(3, "Review")],
  variants: [{ activities: [2, 3], cases: { original: 1 } }],
  transitions: [
    { source: 0, target: 2, wait: WAIT },
    { source: 2, target: 3, wait: WAIT },
    { source: 3, target: 1, wait: WAIT }
  ],
  groups: [{ id: "original" }, { id: "aB3dE5gH" }],
  overlapCases: 0,
  skippedCaseLevel: []
};

describe("findNode", () => {
  it("finds an activity by id with the transitions into and out of it", () => {
    const found = findNode(graph, 2);
    expect(found?.node.label).toBe("Register");
    expect(found?.incoming).toEqual([graph.transitions[0]]);
    expect(found?.outgoing).toEqual([graph.transitions[1]]);
  });

  it("returns null with no selection, Start, End or an unknown id", () => {
    expect(findNode(graph, null)).toBeNull();
    expect(findNode(graph, 0)).toBeNull();
    expect(findNode(graph, 1)).toBeNull();
    expect(findNode(graph, 9)).toBeNull();
  });
});

describe("dfgSummary", () => {
  it("names the payload sizes, the Group ids and the build key", () => {
    expect(dfgSummary(graph, "k1")).toBe(
      "2 nodes · 1 variants · 3 transitions · groups: original, aB3dE5gH · key: k1"
    );
  });

  it("reads a missing key as none", () => {
    expect(dfgSummary(graph, null)).toContain("key: none");
  });
});

describe("plainSimplified", () => {
  it("spells the Variant keys out as an array so they survive JSON", () => {
    const simplified: Simplified = {
      nodes: [],
      edges: [],
      variants: { shown: 1, total: 1, cases: 1, totalCases: 1, keys: new Set(["a", "b"]) },
      activities: { shown: 2, total: 2 },
      paths: { shown: 1, total: 1 }
    };
    expect(JSON.parse(JSON.stringify(plainSimplified(simplified))).variants.keys).toEqual([
      "a",
      "b"
    ]);
  });
});

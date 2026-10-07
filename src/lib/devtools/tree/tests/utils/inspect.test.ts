import { describe, expect, it } from "vitest";
import { findNode, treeSummary } from "$lib/devtools/tree/utils/inspect";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";

function node(id: number, parent: number | null): TreeNode {
  return {
    id,
    parent,
    label: `N${id}`,
    cases: { original: 1 },
    eventLevel: {},
    transitionTime: null,
    comovement: [],
    variantKey: null
  };
}

const tree: ResponseDirectedTree = {
  nodes: [node(0, null), node(3, 0)],
  groups: [
    { id: "original", caseCount: 1, caseLevel: {} },
    { id: "aB3dE5gH", caseCount: 1, caseLevel: {} }
  ],
  caseLevelTests: {},
  overlapCases: 0,
  variantsTotal: 1,
  variantsIncluded: 1,
  caseCoverage: 1,
  cappedByCeiling: false,
  transitionTimeBasis: "completeOnly",
  hasActivityDuration: false
};

describe("findNode", () => {
  it("finds a node by id, not by index", () => {
    expect(findNode(tree, 3)?.label).toBe("N3");
  });

  it("returns null with no selection or an unknown id", () => {
    expect(findNode(tree, null)).toBeNull();
    expect(findNode(tree, 1)).toBeNull();
  });
});

describe("treeSummary", () => {
  it("names the node count, the Group ids and the build key", () => {
    expect(treeSummary(tree, "k1")).toBe("2 nodes · groups: original, aB3dE5gH · key: k1");
  });

  it("reads a missing key as none", () => {
    expect(treeSummary(tree, null)).toContain("key: none");
  });
});

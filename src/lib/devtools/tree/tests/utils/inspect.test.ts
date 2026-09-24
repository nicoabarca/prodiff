import { describe, expect, it } from "vitest";
import {
  branchPreview,
  childrenOf,
  findNode,
  formatPrimitive,
  isDurationPath,
  kindOf,
  toJson,
  treeSummary
} from "$lib/devtools/tree/utils/inspect";
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

describe("toJson", () => {
  it("round-trips the payload unchanged", () => {
    expect(JSON.parse(toJson(tree))).toEqual(tree);
  });
});

describe("childrenOf", () => {
  it("keys an array by index and an object by field", () => {
    expect(childrenOf(["a", "b"])).toEqual([
      ["0", "a"],
      ["1", "b"]
    ]);
    expect(childrenOf({ x: 1 })).toEqual([["x", 1]]);
  });

  it("gives a primitive no children", () => {
    expect(childrenOf(3)).toEqual([]);
    expect(childrenOf(null)).toEqual([]);
  });
});

describe("branchPreview", () => {
  it("counts children in the branch's own brackets", () => {
    expect(branchPreview(tree.nodes)).toBe("[2]");
    expect(branchPreview({ a: 1, b: 2, c: 3 })).toBe("{3}");
    expect(branchPreview({})).toBe("{0}");
  });
});

describe("kindOf and formatPrimitive", () => {
  it("reads every JSON kind", () => {
    expect([{}, [], "s", 1, true, null].map(kindOf)).toEqual([
      "object",
      "array",
      "string",
      "number",
      "boolean",
      "null"
    ]);
  });

  it("quotes strings and spells out null", () => {
    expect(formatPrimitive("completeOnly")).toBe('"completeOnly"');
    expect(formatPrimitive(0.8591)).toBe("0.8591");
    expect(formatPrimitive(null)).toBe("null");
  });
});

describe("isDurationPath", () => {
  it("reads the Transition Time block's value fields as milliseconds", () => {
    expect(isDurationPath(["nodes", "3", "transitionTime", "summaries", "original", "mean"])).toBe(
      true
    );
    expect(isDurationPath(["transitionTime", "summaries", "aB3dE5gH", "whiskerHigh"])).toBe(true);
  });

  it("reads a duration attribute under eventLevel as milliseconds", () => {
    expect(isDurationPath(["eventLevel", "Activity Duration", "summaries", "original", "q3"])).toBe(
      true
    );
  });

  it("leaves counts, test figures and other attributes alone", () => {
    expect(isDurationPath(["transitionTime", "summaries", "original", "n"])).toBe(false);
    expect(isDurationPath(["transitionTime", "summaries", "original", "outliersLow"])).toBe(false);
    expect(isDurationPath(["transitionTime", "test", "statistic"])).toBe(false);
    expect(isDurationPath(["eventLevel", "Cost", "summaries", "original", "mean"])).toBe(false);
    expect(isDurationPath(["caseCoverage"])).toBe(false);
  });
});

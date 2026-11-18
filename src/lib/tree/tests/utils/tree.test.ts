import { describe, expect, it } from "vitest";
import { stableKeys } from "$lib/tree/utils/flow";
import {
  caseLevelBlocks,
  caseSplit,
  nodeDepth,
  nodeTarget,
  subtreeVariants,
  visibleNodes
} from "$lib/tree/utils/tree";
import { defaultTreeView } from "$lib/tree/types";
import type { Summary, Test } from "$lib/analysis/types";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";

function node(
  id: number,
  parent: number | null,
  label: string,
  variantKey: string | null
): TreeNode {
  return {
    id,
    parent,
    label,
    cases: {},
    eventLevel: {},
    transitionTime: null,
    comovement: [],
    variantKey
  };
}

function treeOf(nodes: TreeNode[]): ResponseDirectedTree {
  return {
    nodes,
    groups: [],
    caseLevelTests: {},
    variantsTotal: 0,
    variantsIncluded: 0,
    caseCoverage: 0,
    cappedByCeiling: false,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false
  };
}

describe("stableKeys", () => {
  it("names a node by the path of activities down to it", () => {
    const keys = stableKeys(
      treeOf([
        node(0, null, "Start", null),
        node(1, 0, "Register", null),
        node(2, 1, "Pay", "Register,Pay")
      ])
    );
    expect(keys.get(2)).toBe("Start/Register/Pay!");
  });

  it("tells a terminal node from the sibling that carries on", () => {
    const keys = stableKeys(
      treeOf([
        node(0, null, "Start", null),
        node(1, 0, "Pay", "Pay"),
        node(2, 0, "Pay", null),
        node(3, 2, "Ship", "Pay,Ship")
      ])
    );
    expect(keys.get(1)).not.toBe(keys.get(2));
    expect(keys.get(1)).toBe("Start/Pay!");
    expect(keys.get(2)).toBe("Start/Pay");
  });

  it("keeps a slash in an activity name from forging a path", () => {
    const forged = stableKeys(treeOf([node(0, null, "A/B", null)]));
    const nested = stableKeys(treeOf([node(0, null, "A", null), node(1, 0, "B", null)]));
    expect(forged.get(0)).not.toBe(nested.get(1));
  });

  it("tells a terminal marker from an exclamation point in an activity name", () => {
    const marked = stableKeys(treeOf([node(0, null, "Pay!", null)]));
    const terminal = stableKeys(treeOf([node(0, null, "Pay", "Pay")]));
    expect(marked.get(0)).not.toBe(terminal.get(0));
  });

  it("gives a node the same name when the ids around it move", () => {
    const first = stableKeys(
      treeOf([node(0, null, "Start", null), node(1, 0, "Pay", "Pay"), node(2, 0, "Ship", "Ship")])
    );
    const second = stableKeys(
      treeOf([node(0, null, "Start", null), node(1, 0, "Ship", "Ship"), node(2, 0, "Pay", "Pay")])
    );
    expect(second.get(2)).toBe(first.get(1));
  });
});

describe("caseLevelBlocks", () => {
  const north = (n: number): Summary => ({ type: "categorical", n, counts: { north: n } });
  const chi: Test = {
    test: "chi2",
    statistic: 4,
    pValue: 0.01,
    effectSize: 0.4,
    effectSigned: null,
    significant: true,
    higher: null
  };

  it("joins each Group's summary and the test into one block per attribute", () => {
    const tree = {
      ...treeOf([]),
      groups: [
        { id: "a", caseCount: 3, caseLevel: { region: north(3) } },
        { id: "b", caseCount: 2, caseLevel: { region: north(2), channel: north(2) } }
      ],
      caseLevelTests: { region: chi }
    };
    expect(caseLevelBlocks(tree)).toEqual({
      region: { summaries: { a: north(3), b: north(2) }, test: chi },
      channel: { summaries: { b: north(2) }, test: null }
    });
  });
});

describe("nodeTarget", () => {
  // Start → A → { B (ends), C (ends) }
  const tree = treeOf(
    [
      node(0, null, "Start", null),
      node(1, 0, "A", null),
      node(2, 1, "B", "A\u0001B"),
      node(3, 1, "C", "A\u0001C")
    ].map((n) => ({ ...n, cases: { a: n.id === 2 || n.id === 3 ? 1 : 2 } }))
  );
  const visible = visibleNodes(tree, { ...defaultTreeView, collapsed: new Set() }, new Set());

  it.each([
    ["a leaf", 2, 2, ["A\u0001B"]],
    ["an inner node", 1, 1, ["A\u0001B", "A\u0001C"]],
    ["the Start root", 0, 0, ["A\u0001B", "A\u0001C"]]
  ])("names %s the way a Distributions request does", (_, id, depth, variants) => {
    const target = nodeTarget(tree, visible, id, "atStep", "cost", true);
    expect(target).toEqual({
      kind: "node",
      variants: subtreeVariants(tree, visible, id),
      depth: nodeDepth(tree, id),
      scope: "atStep",
      attribute: "cost",
      finiteOnly: true
    });
    expect(target.kind === "node" && target.depth).toBe(depth);
    expect(target.kind === "node" && [...target.variants].sort()).toEqual(variants);
  });
});

describe("caseSplit", () => {
  it("divides a node's cases between its Groups", () => {
    expect(caseSplit({ a: 13_252, b: 66_892 })).toEqual({
      a: 13_252 / 80_144,
      b: 66_892 / 80_144
    });
  });

  it("gives every Group zero when no case is counted", () => {
    expect(caseSplit({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });
});

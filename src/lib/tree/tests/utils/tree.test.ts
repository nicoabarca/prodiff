import { describe, expect, it } from "vitest";
import { stableKeys } from "$lib/tree/utils/flow";
import { caseLevelBlocks } from "$lib/tree/utils/tree";
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
    approximate: false,
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

import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import { edgeWaits, toFlow, type FlowOptions, type TreeNodeData } from "$lib/tree/utils/flow";

function numerical(mean: number, n: number, median = mean): Summary {
  return {
    type: "numerical",
    n,
    mean,
    std: 0,
    min: mean,
    q1: mean,
    median,
    q3: mean,
    max: mean,
    whiskerLow: mean,
    whiskerHigh: mean,
    outliersLow: 0,
    outliersHigh: 0
  };
}

function node(fields: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 1,
    parent: 0,
    label: "Register",
    cases: {},
    eventLevel: {},
    transitionTime: null,
    comovement: [],
    variantKey: null,
    ...fields
  };
}

describe("edgeWaits", () => {
  const groups = [
    { id: "a", name: "Approved", color: "group-2" },
    { id: "b", name: "Rejected", color: "group-6" }
  ];

  it("gives each Group's mean wait its colour, never its name", () => {
    const transitionTime = {
      summaries: { a: numerical(60_000, 2), b: numerical(3_600_000, 1) },
      test: null
    };
    expect(edgeWaits(node({ transitionTime }), groups, "mean")).toEqual([
      { id: "a", color: "group-2", value: "1m 0s" },
      { id: "b", color: "group-6", value: "1h 0m" }
    ]);
  });

  it("leaves out a Group with no wait here", () => {
    const transitionTime = { summaries: { b: numerical(60_000, 1) }, test: null };
    expect(edgeWaits(node({ transitionTime }), groups, "mean")).toEqual([
      { id: "b", color: "group-6", value: "1m 0s" }
    ]);
  });

  it("is empty without Transition Time", () => {
    expect(edgeWaits(node(), groups, "mean")).toEqual([]);
  });

  it("reads the statistic the view asks for", () => {
    const transitionTime = { summaries: { a: numerical(60_000, 2, 1_000) }, test: null };
    expect(edgeWaits(node({ transitionTime }), groups, "median")).toEqual([
      { id: "a", color: "group-2", value: "1s" }
    ]);
  });
});

describe("toFlow", () => {
  const ids = ["a", "b"];
  const tree: ResponseDirectedTree = {
    nodes: [
      node({ id: 0, parent: null, label: "Start", cases: { a: 4, b: 6 } }),
      node({ id: 1, parent: 0, label: "Both", cases: { a: 3, b: 5 }, variantKey: "both" }),
      node({ id: 2, parent: 0, label: "Only a", cases: { a: 1 }, variantKey: "a" }),
      node({ id: 3, parent: 0, label: "Only b", cases: { b: 1 }, variantKey: "b" })
    ],
    groups: ids.map((id) => ({ id, caseCount: 10, caseLevel: {} })),
    caseLevelTests: {},
    variantsTotal: 3,
    variantsIncluded: 3,
    caseCoverage: 1,
    cappedByCeiling: false,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false
  };
  const visible = {
    ids: new Set([0, 1, 2, 3]),
    hiddenBelow: new Map(),
    variantsShown: 3,
    variantsHidden: 0,
    casesShown: 10,
    cases: new Map(tree.nodes.map((n) => [n.id, n.cases]))
  };

  function flow(options: Partial<FlowOptions> = {}) {
    return toFlow(tree, visible, {
      groups: ids.map((id) => ({ id, name: id, color: `group-${id}` })),
      figure: { kind: "cases" },
      statistic: "mean",
      focus: "all",
      edgeLabels: false,
      edgeWidth: "cases",
      selected: null,
      onToggleCollapse: () => {},
      ...options
    });
  }

  function dimmedLabels(options: Partial<FlowOptions>): string[] {
    return flow(options)
      .nodes.map((n) => n.data as TreeNodeData)
      .filter((data) => data.dimmed)
      .map((data) => data.label);
  }

  it("focusing a Group dims only the nodes it never reaches", () => {
    expect(dimmedLabels({ focus: "a" })).toEqual(["Only b"]);
  });

  it("focusing what is shared dims the nodes one Group reaches alone", () => {
    expect(dimmedLabels({ focus: "shared" })).toEqual(["Only a", "Only b"]);
  });

  it("a focus on a Group no longer compared dims nothing", () => {
    expect(dimmedLabels({ focus: "gone" })).toEqual([]);
  });

  it("scales edges by cases, or draws them all one width", () => {
    const widths = (edgeWidth: FlowOptions["edgeWidth"]) =>
      flow({ edgeWidth }).edges.map((edge) => edge.style);
    expect(widths("cases").map((style) => style?.split(";")[0])).toEqual([
      "stroke-width:4.50",
      "stroke-width:1.00",
      "stroke-width:1.00"
    ]);
    expect(widths("uniform").map((style) => style?.split(";")[0])).toEqual([
      "stroke-width:1.5",
      "stroke-width:1.5",
      "stroke-width:1.5"
    ]);
  });
});

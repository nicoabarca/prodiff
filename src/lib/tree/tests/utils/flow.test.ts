import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import {
  edgeWaits,
  toFlow,
  type FlowOptions,
  type TreeEdgeData,
  type TreeNodeData
} from "$lib/tree/utils/flow";

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
      onSelectEdge: () => {},
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

  it("splits each node's cases between the Groups that reach it", () => {
    const split = Object.fromEntries(
      flow()
        .nodes.map((n) => n.data as TreeNodeData)
        .map((data) => [data.label, data.split])
    );
    expect(split["Both"]).toEqual({ a: 3 / 8, b: 5 / 8 });
    expect(split["Only a"]).toEqual({ a: 1 });
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

describe("toFlow edges", () => {
  const passed = {
    test: "mannwhitney",
    statistic: 0,
    pValue: 0.001,
    effectSize: 0.6,
    effectSigned: null,
    significant: true,
    higher: "b"
  } as const;
  const tree: ResponseDirectedTree = {
    nodes: [
      node({ id: 0, parent: null, label: "Start", cases: { a: 2, b: 2 } }),
      node({ id: 1, parent: 0, label: "Register", cases: { a: 2, b: 2 } }),
      node({
        id: 2,
        parent: 1,
        label: "Check",
        cases: { a: 2, b: 2 },
        variantKey: "v",
        transitionTime: { summaries: {}, test: passed }
      })
    ],
    groups: [
      { id: "a", caseCount: 2, caseLevel: {} },
      { id: "b", caseCount: 2, caseLevel: {} }
    ],
    caseLevelTests: {},
    variantsTotal: 1,
    variantsIncluded: 1,
    caseCoverage: 1,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false
  };
  const visible = {
    ids: new Set([0, 1, 2]),
    hiddenBelow: new Map(),
    variantsShown: 1,
    variantsHidden: 0,
    casesShown: 4,
    cases: new Map(tree.nodes.map((n) => [n.id, n.cases]))
  };

  function edges(options: Partial<FlowOptions> = {}) {
    return toFlow(tree, visible, {
      groups: [
        { id: "a", name: "a", color: "group-a" },
        { id: "b", name: "b", color: "group-b" }
      ],
      figure: { kind: "cases" },
      statistic: "mean",
      focus: "all",
      edgeLabels: false,
      edgeWidth: "uniform",
      selected: null,
      onToggleCollapse: () => {},
      onSelectEdge: () => {},
      ...options
    }).edges;
  }

  it("marks the edge whose Transition Time differs, never the node", () => {
    const [fromStart, intoCheck] = edges().map((edge) => edge.data as TreeEdgeData);
    expect(fromStart.finding).toBeNull();
    expect(intoCheck.finding).toEqual({ band: "large", step: 4 });
  });

  it("paints an edge in the Group that alone reaches its child, the trunk only when the parent is that Group's too", () => {
    const owned = {
      ...tree,
      nodes: [
        ...tree.nodes,
        node({ id: 3, parent: 1, label: "Pay", cases: { a: 0, b: 3 }, variantKey: "w" }),
        node({ id: 4, parent: 3, label: "Close", cases: { a: 0, b: 3 }, variantKey: "w" })
      ]
    };
    const drawn = toFlow(
      owned,
      { ...visible, ids: new Set([0, 1, 2, 3, 4]) },
      {
        groups: [
          { id: "a", name: "a", color: "group-a" },
          { id: "b", name: "b", color: "group-b" }
        ],
        figure: { kind: "cases" },
        statistic: "mean",
        focus: "all",
        edgeLabels: false,
        edgeWidth: "uniform",
        selected: null,
        onToggleCollapse: () => {},
        onSelectEdge: () => {}
      }
    ).edges.map((edge) => (edge.data as TreeEdgeData).owner);
    expect(drawn).toEqual([
      null,
      null,
      { color: "group-b", trunk: false, from: expect.any(Number) },
      { color: "group-b", trunk: true, from: 0 }
    ]);
  });

  it("starts a Group's colour past the last sibling on its side that is shared", () => {
    // Siblings sit by volume, least on the left: Fine, Check, Pay, Late.
    const forked = {
      ...tree,
      nodes: [
        ...tree.nodes,
        node({ id: 3, parent: 1, label: "Fine", cases: { a: 0, b: 1 }, variantKey: "w" }),
        node({ id: 5, parent: 1, label: "Pay", cases: { a: 0, b: 5 }, variantKey: "x" }),
        node({ id: 6, parent: 1, label: "Late", cases: { a: 0, b: 6 }, variantKey: "y" })
      ]
    };
    const flow = toFlow(
      forked,
      {
        ...visible,
        ids: new Set([0, 1, 2, 3, 5, 6]),
        cases: new Map(forked.nodes.map((n) => [n.id, n.cases]))
      },
      {
        groups: [
          { id: "a", name: "a", color: "group-a" },
          { id: "b", name: "b", color: "group-b" }
        ],
        figure: { kind: "cases" },
        statistic: "mean",
        focus: "all",
        edgeLabels: false,
        edgeWidth: "uniform",
        selected: null,
        onToggleCollapse: () => {},
        onSelectEdge: () => {}
      }
    );
    const x = (id: number) =>
      flow.nodes.find((drawn) => drawn.id === flow.keys.get(id))!.position.x;
    const from = (id: number) =>
      (flow.edges.find((edge) => edge.target === flow.keys.get(id))!.data as TreeEdgeData).owner
        ?.from;
    expect(from(3)).toBe(x(2) - x(1));
    expect(from(3)).toBeLessThan(0);
    expect(from(5)).toBe(0);
    expect(from(6)).toBe(0);
  });

  it("makes only edges carrying Transition Time clickable", () => {
    expect(edges().map((edge) => (edge.data as TreeEdgeData).clickable)).toEqual([false, true]);
  });

  it("selects an edge by the node it leads into", () => {
    const chosen: number[] = [];
    const drawn = edges({
      selected: { kind: "edge", childId: 2 },
      onSelectEdge: (id) => chosen.push(id)
    });
    expect(drawn.map((edge) => (edge.data as TreeEdgeData).selected)).toEqual([false, true]);
    expect(drawn[1].style).toContain("stroke:var(--ring)");
    (drawn[1].data as TreeEdgeData).onSelect();
    expect(chosen).toEqual([2]);
  });
});

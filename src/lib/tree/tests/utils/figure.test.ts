import { describe, expect, it } from "vitest";
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { Summary } from "$lib/analysis/types";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import { figureAttributes, nodeFigure, nodeFigures } from "$lib/tree/utils/figure";

function numerical(mean: number, median: number): Summary {
  return {
    type: "numerical",
    n: 2,
    mean,
    std: 0,
    min: 0,
    q1: 0,
    median,
    q3: 0,
    max: 0,
    whiskerLow: 0,
    whiskerHigh: 0,
    outliersLow: 0,
    outliersHigh: 0
  };
}

function categorical(counts: Record<string, number>, n: number): Summary {
  return { type: "categorical", n, counts };
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

function treeOf(nodes: TreeNode[]): ResponseDirectedTree {
  return {
    nodes,
    groups: [
      { id: "a", caseCount: 40, caseLevel: {} },
      { id: "b", caseCount: 200, caseLevel: {} }
    ],
    caseLevelTests: {},
    variantsTotal: 0,
    variantsIncluded: 0,
    caseCoverage: 0,
    cappedByCeiling: false,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false
  };
}

const groups = treeOf([]).groups;

describe("figureAttributes", () => {
  it("lists numbers by name, durations after them, then categories", () => {
    const attributes = figureAttributes(
      treeOf([
        node({
          parent: null,
          eventLevel: { zeta: { summaries: {}, test: null }, empty: { summaries: {}, test: null } }
        }),
        node({
          eventLevel: {
            zeta: { summaries: { a: numerical(1, 1) }, test: null },
            alpha: { summaries: { a: numerical(1, 1) }, test: null },
            channel: { summaries: { a: categorical({ web: 1 }, 1) }, test: null }
          },
          transitionTime: { summaries: { a: numerical(1, 1) }, test: null }
        })
      ])
    );
    expect(attributes).toEqual([
      { kind: "number", name: "alpha" },
      { kind: "number", name: "zeta" },
      { kind: "number", name: TRANSITION_TIME },
      { kind: "category", name: "channel", value: "web" }
    ]);
  });

  it("names a category's commonest value across every node and Group", () => {
    const block = (a: Record<string, number>, b: Record<string, number>) => ({
      summaries: { a: categorical(a, 9), b: categorical(b, 9) },
      test: null
    });
    const attributes = figureAttributes(
      treeOf([
        node({ eventLevel: { channel: block({ web: 3, mail: 1 }, { mail: 1 }) } }),
        node({ eventLevel: { channel: block({ mail: 2 }, { mail: 1, fax: 8 }) } })
      ])
    );
    expect(attributes).toEqual([{ kind: "category", name: "channel", value: "fax" }]);
  });
});

describe("nodeFigure", () => {
  const amount = { kind: "number", name: "amount" } as const;
  const channel = { kind: "category", name: "channel", value: "web" } as const;

  it("shows what the view chose", () => {
    expect(nodeFigure({ metric: "share", attribute: "amount" }, [amount])).toEqual({
      kind: "share"
    });
    expect(nodeFigure({ metric: "attribute", attribute: "channel" }, [amount, channel])).toEqual(
      channel
    );
  });

  it("falls back when the tree was not built with the attribute", () => {
    expect(nodeFigure({ metric: "attribute", attribute: "gone" }, [amount])).toEqual(amount);
    expect(nodeFigure({ metric: "attribute", attribute: "gone" }, [])).toEqual({ kind: "cases" });
  });
});

describe("nodeFigures", () => {
  it("shows the cases on screen, nothing for a Group with none", () => {
    expect(nodeFigures(node(), { kind: "cases" }, "mean", { a: 1200 }, groups)).toEqual([
      (1200).toLocaleString(),
      null
    ]);
  });

  it("divides by the Group's whole case count for a share", () => {
    expect(nodeFigures(node(), { kind: "share" }, "mean", { a: 10, b: 1 }, groups)).toEqual([
      "25.0%",
      "0.5%"
    ]);
  });

  it("rounds a number's statistic", () => {
    const eventLevel = { amount: { summaries: { a: numerical(10.6, 3.2) }, test: null } };
    const figure = { kind: "number", name: "amount" } as const;
    expect(nodeFigures(node({ eventLevel }), figure, "mean", {}, groups)).toEqual(["11", null]);
    expect(nodeFigures(node({ eventLevel }), figure, "median", {}, groups)).toEqual(["3", null]);
  });

  it("formats a duration's statistic and reads Transition Time off its own block", () => {
    const transitionTime = { summaries: { b: numerical(60_000, 1_000) }, test: null };
    const figure = { kind: "number", name: TRANSITION_TIME } as const;
    expect(nodeFigures(node({ transitionTime }), figure, "median", {}, groups)).toEqual([
      null,
      "1s"
    ]);
  });

  it("shows a category as the share holding its value, out of every case with one", () => {
    const eventLevel = {
      channel: {
        summaries: { a: categorical({ web: 1, mail: 3 }, 4), b: categorical({ mail: 2 }, 2) },
        test: null
      }
    };
    const figure = { kind: "category", name: "channel", value: "web" } as const;
    expect(nodeFigures(node({ eventLevel }), figure, "mean", {}, groups)).toEqual([
      "25.0%",
      "0.0%"
    ]);
  });
});

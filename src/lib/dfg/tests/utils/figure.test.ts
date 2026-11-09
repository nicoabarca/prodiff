import { describe, expect, it } from "vitest";
import { ACTIVITY_DURATION } from "$lib/analysis/attributes";
import type { Summary } from "$lib/analysis/types";
import type { DfgNode, PlaceBlock, ResponseDfg } from "$lib/dfg/invokers/types";
import { ACTIVITY_FREQUENCY, REPETITIONS, defaultDfgView } from "$lib/dfg/types";
import { figureAttributes, nodeFigure, nodeFigures } from "$lib/dfg/utils/figure";

const groups = [
  { id: "a", name: "Day", color: "group-2" },
  { id: "b", name: "Night", color: "group-6" }
];

const numbers = (mean: number, median: number): Summary => ({
  type: "numerical",
  n: 3,
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
});

const twoByTwo = (counts: Record<string, number>): Summary => ({
  type: "categorical",
  n: Object.values(counts).reduce((sum, count) => sum + count, 0),
  counts
});

const place = (summaries: Record<string, Summary>): PlaceBlock => ({
  summaries,
  test: null,
  method: null
});

function activity(overrides: Partial<DfgNode> = {}): DfgNode {
  return {
    id: 2,
    label: "Review",
    counts: { a: { cases: 3, events: 5 }, b: { cases: 1, events: 1 } },
    attributes: {},
    values: {},
    ...overrides
  };
}

function graphOf(nodes: DfgNode[]): ResponseDfg {
  return { nodes, variants: [], transitions: [], groups: [], caseLevel: {} };
}

describe("figureAttributes", () => {
  it("offers numbers, durations last, then each category at its commonest value", () => {
    const node = activity({
      attributes: {
        [ACTIVITY_DURATION]: place({ a: numbers(1, 1) }),
        cost: place({ a: numbers(1, 1) }),
        [ACTIVITY_FREQUENCY]: place({ a: twoByTwo({ Reached: 3, "Not reached": 1 }) }),
        [REPETITIONS]: place({ a: twoByTwo({ "More than once": 1, Once: 2 }) })
      },
      values: {
        channel: {
          web: place({ a: twoByTwo({ Held: 1, "Not held": 2 }) }),
          phone: place({ a: twoByTwo({ Held: 2, "Not held": 1 }) })
        }
      }
    });
    expect(figureAttributes(graphOf([node]))).toEqual([
      { kind: "number", name: "cost" },
      { kind: "number", name: ACTIVITY_DURATION },
      { kind: "category", name: "channel", value: "phone" },
      { kind: "category", name: REPETITIONS, value: "More than once" }
    ]);
  });

  it("offers nothing on a graph built without attributes", () => {
    expect(figureAttributes(graphOf([activity()]))).toEqual([]);
    expect(figureAttributes(null)).toEqual([]);
  });
});

describe("nodeFigure", () => {
  const attributes = [{ kind: "number" as const, name: ACTIVITY_DURATION }];

  it("reads a metric as is", () => {
    expect(nodeFigure({ figure: "share", attribute: null }, attributes)).toEqual({
      kind: "share"
    });
  });

  it("gives an attribute the graph lacks way to the first it has, else to cases", () => {
    expect(
      nodeFigure({ ...defaultDfgView, figure: "attribute", attribute: "gone" }, attributes)
    ).toEqual(attributes[0]);
    expect(nodeFigure({ figure: "attribute", attribute: "gone" }, [])).toEqual({ kind: "cases" });
  });
});

describe("nodeFigures", () => {
  const caseCounts = new Map([
    ["a", 6],
    ["b", 4]
  ]);
  const counts = { a: { cases: 3, events: 5 }, b: { cases: 0, events: 0 } };

  it("prints counts and the share of the group's cases", () => {
    const node = activity();
    expect(nodeFigures(counts, node, { kind: "events" }, "mean", caseCounts, groups)).toEqual({
      a: "5",
      b: null
    });
    expect(nodeFigures(counts, node, { kind: "share" }, "mean", caseCounts, groups)).toEqual({
      a: "50.0%",
      b: null
    });
  });

  it("prints a number in the statistic asked for, as a duration where it is one", () => {
    const node = activity({
      attributes: {
        [ACTIVITY_DURATION]: place({ a: numbers(120_000, 60_000) }),
        cost: place({ b: numbers(10.4, 3) })
      }
    });
    const duration = { kind: "number" as const, name: ACTIVITY_DURATION };
    expect(nodeFigures(counts, node, duration, "median", caseCounts, groups)).toEqual({
      a: "1m 0s",
      b: null
    });
    expect(
      nodeFigures(counts, node, { kind: "number", name: "cost" }, "mean", caseCounts, groups)
    ).toEqual({ a: null, b: "10" });
  });

  it("prints a category as the share of cases holding its value", () => {
    const node = activity({
      attributes: { [REPETITIONS]: place({ a: twoByTwo({ "More than once": 1, Once: 3 }) }) },
      values: { channel: { web: place({ b: twoByTwo({ Held: 1, "Not held": 1 }) }) } }
    });
    expect(
      nodeFigures(
        counts,
        node,
        { kind: "category", name: "channel", value: "web" },
        "mean",
        caseCounts,
        groups
      )
    ).toEqual({ a: null, b: "50.0%" });
    expect(
      nodeFigures(
        counts,
        node,
        { kind: "category", name: REPETITIONS, value: "More than once" },
        "mean",
        caseCounts,
        groups
      )
    ).toEqual({ a: "25.0%", b: null });
  });
});

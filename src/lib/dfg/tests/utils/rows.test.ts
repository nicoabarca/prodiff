import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import type { DfgNode } from "$lib/dfg/invokers/types";
import { ACTIVITY_KEY, DELTA_KEY, measureRange, measureRows, sortRows } from "$lib/dfg/utils/rows";
import { CASES, measureKey } from "$lib/dfg/utils/measure";
import type { SimplifiedNode } from "$lib/dfg/utils/simplify";

const groups = [
  { id: "a", name: "Event Log", color: "group-original" },
  { id: "b", name: "High value", color: "group-a" }
];

const numerical = (mean: number, n: number): Summary => ({
  type: "numerical",
  n,
  mean,
  std: 0,
  min: mean,
  q1: mean,
  median: mean,
  q3: mean,
  max: mean,
  whiskerLow: mean,
  whiskerHigh: mean,
  outliersLow: 0,
  outliersHigh: 0
});

const nodes: SimplifiedNode[] = [
  { id: 0, label: "Start", kind: "start", counts: { a: { cases: 10, events: 10 } } },
  {
    id: 2,
    label: "Approve",
    counts: { a: { cases: 10, events: 12 }, b: { cases: 4, events: 4 } },
    kind: "activity"
  },
  { id: 3, label: "Reject", counts: { b: { cases: 2, events: 2 } }, kind: "activity" }
];

const measured = new Map<number, DfgNode>([
  [
    2,
    {
      id: 2,
      label: "Approve",
      counts: {},
      attributes: {
        Amount: {
          summaries: { a: numerical(100, 10), b: numerical(250, 4) },
          test: {
            test: "mannwhitney",
            statistic: 1,
            pValue: 0.01,
            effectSize: 0.42,
            effectSigned: 0.42,
            significant: true,
            higher: "b"
          }
        }
      }
    }
  ]
]);

const measures = [CASES, { kind: "attribute" as const, name: "Amount" }];
const amount = measureKey(measures[1]);
const rows = measureRows(nodes, measured, groups, measures);

describe("measureRows", () => {
  it("leaves Start and End out", () => {
    expect(rows.map((row) => row.label)).toEqual(["Approve", "Reject"]);
  });

  it("carries both Groups' figures, the change and the test", () => {
    const cell = rows[0].cells[measureKey(measures[1])];

    expect(cell.values).toEqual({ a: 100, b: 250 });
    expect(cell.delta).toBe(150);
    expect(cell.test?.significant).toBe(true);
  });

  it("has no change where a Group has no figure to divide by", () => {
    expect(rows[1].cells[measureKey(CASES)].delta).toBeNull();
    expect(rows[1].reach).toEqual(["b"]);
  });

  it("leaves a frequency untested", () => {
    expect(rows[0].cells[measureKey(CASES)].test).toBeNull();
  });
});

describe("sortRows", () => {
  it("ranks by a measure's union", () => {
    expect(
      sortRows(rows, { key: measureKey(CASES), direction: "desc" }, amount).map((row) => row.label)
    ).toEqual(["Approve", "Reject"]);
    expect(
      sortRows(rows, { key: measureKey(CASES), direction: "asc" }, amount).map((row) => row.label)
    ).toEqual(["Reject", "Approve"]);
  });

  it("sorts a row the measure says nothing about last, either way", () => {
    const key = measureKey(measures[1]);
    expect(sortRows(rows, { key, direction: "desc" }, amount).map((row) => row.label)).toEqual([
      "Approve",
      "Reject"
    ]);
    expect(sortRows(rows, { key, direction: "asc" }, amount).map((row) => row.label)).toEqual([
      "Approve",
      "Reject"
    ]);
  });

  it("ranks by the size of the difference the Δ column reports", () => {
    const ranked = sortRows(rows, { key: DELTA_KEY, direction: "desc" }, amount);

    expect(ranked.map((row) => row.label)).toEqual(["Approve", "Reject"]);
    expect(ranked[1].cells[amount].delta).toBeNull();
  });

  it("sorts the activity column by name", () => {
    expect(
      sortRows(rows, { key: ACTIVITY_KEY, direction: "asc" }, amount).map((row) => row.label)
    ).toEqual(["Approve", "Reject"]);
  });
});

describe("measureRange", () => {
  it("covers the rows the measure reaches", () => {
    expect(measureRange(rows, measureKey(CASES))).toEqual([2, 14]);
    expect(measureRange(rows, measureKey(measures[1]))).toEqual([
      (100 * 10 + 250 * 4) / 14,
      (100 * 10 + 250 * 4) / 14
    ]);
  });

  it("has nothing where no row holds the measure", () => {
    expect(measureRange(rows, "attribute:Nothing")).toBeNull();
  });
});

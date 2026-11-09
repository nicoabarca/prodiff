import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import type { Test } from "$lib/analysis/types";
import {
  busiestPerCase,
  edgeStroke,
  edgeFrequency,
  edgeLines,
  edgeWait,
  faceCounts,
  faceFigures,
  perCase,
  shadeValue
} from "$lib/dfg/utils/face";

describe("faceCounts", () => {
  it("keys displayed counts by Group id", () => {
    const counts = faceCounts(
      {
        original: { cases: 4, events: 7 },
        selected: { cases: 0, events: 2 }
      },
      [
        { id: "selected", name: "Selected", color: "group-a" },
        { id: "original", name: "Original", color: "group-original" }
      ],
      "cases"
    );

    expect(counts).toEqual({ selected: null, original: "4" });
  });
});

describe("shadeValue", () => {
  const counts = {
    a: { cases: 3, events: 9 },
    b: { cases: 2, events: 4 }
  };

  it("is the union across the Groups in the measure shown", () => {
    expect(shadeValue({ kind: "activity", counts }, "cases")).toBe(5);
    expect(shadeValue({ kind: "activity", counts }, "events")).toBe(13);
  });

  it("is missing for Start and End", () => {
    expect(shadeValue({ kind: "start", counts }, "cases")).toBeNull();
    expect(shadeValue({ kind: "end", counts }, "cases")).toBeNull();
  });

  it("is missing where nothing reached the node", () => {
    expect(
      shadeValue({ kind: "activity", counts: { a: { cases: 0, events: 0 } } }, "cases")
    ).toBeNull();
  });
});

describe("edgeWait", () => {
  const groups = [
    { id: "a", name: "Day", color: "group-2" },
    { id: "b", name: "Night", color: "group-6" }
  ];
  const mean = (value: number): Summary => ({
    type: "numerical",
    n: 1,
    mean: value,
    std: 0,
    min: value,
    q1: value,
    median: value,
    q3: value,
    max: value,
    whiskerLow: value,
    whiskerHigh: value,
    outliersLow: 0,
    outliersHigh: 0
  });
  const wait = (summaries: Record<string, Summary>) => ({ summaries, test: null });

  it("prints one line per Group that crossed the edge", () => {
    expect(edgeWait(wait({ b: mean(90_000) }), groups, "mean")).toEqual([
      { id: "b", color: "group-6", value: "1m 30s" }
    ]);
  });

  it("labels any wait above zero, printing a sub-second one in ms", () => {
    expect(edgeWait(wait({ b: mean(200) }), groups, "mean")).toEqual([
      { id: "b", color: "group-6", value: "200ms" }
    ]);
    expect(edgeWait(wait({ b: mean(0.2) }), groups, "mean").map((line) => line.value)).toEqual([
      "1ms"
    ]);
  });

  it("leaves an edge unlabelled when no Group waited at all", () => {
    expect(edgeWait(wait({ a: mean(0), b: mean(0) }), groups, "mean")).toEqual([]);
  });

  it("keeps a Group that did not wait when another Group did", () => {
    expect(
      edgeWait(wait({ a: mean(0), b: mean(5_000) }), groups, "mean").map((line) => line.value)
    ).toEqual(["0s", "5s"]);
  });

  it("prints the statistic asked for", () => {
    const skewed: Summary = { ...mean(60_000), median: 2_000 };
    expect(edgeWait(wait({ b: skewed }), groups, "median").map((line) => line.value)).toEqual([
      "2s"
    ]);
  });
});

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

describe("faceFigures", () => {
  const groups = [
    { id: "a", name: "Day", color: "group-2" },
    { id: "b", name: "Night", color: "group-6" }
  ];
  const counts = { a: { cases: 3, events: 9 }, b: { cases: 0, events: 0 } };

  it("prints the count asked for", () => {
    expect(faceFigures(counts, undefined, groups, "events", "mean")).toEqual({ a: "9", b: null });
  });

  it("prints each Group's Service Time in the statistic asked for", () => {
    const block = { summaries: { a: numbers(120_000, 60_000) }, test: null };
    expect(faceFigures(counts, block, groups, "serviceTime", "mean")).toEqual({
      a: "2m 0s",
      b: null
    });
    expect(faceFigures(counts, block, groups, "serviceTime", "median")).toEqual({
      a: "1m 0s",
      b: null
    });
  });

  it("prints nothing for Service Time where the activity has none", () => {
    expect(faceFigures(counts, undefined, groups, "serviceTime", "mean")).toEqual({
      a: null,
      b: null
    });
  });
});

describe("edgeFrequency", () => {
  it("prints the count of each Group that follows the edge", () => {
    const groups = [
      { id: "a", name: "Day", color: "group-2" },
      { id: "b", name: "Night", color: "group-6" }
    ];
    const counts = { a: { cases: 12, events: 15 }, b: { cases: 0, events: 0 } };
    expect(edgeFrequency(counts, groups, "events")).toEqual([
      { id: "a", color: "group-2", value: "15" }
    ]);
  });
});

describe("edgeLines", () => {
  const groups = [{ id: "a", name: "Day", color: "group-2" }];
  const counts = { a: { cases: 4, events: 6 } };
  const wait = { summaries: { a: numbers(3_000, 1_000) }, test: null };

  it("prints nothing when labels are off", () => {
    expect(edgeLines("off", counts, wait, groups, "cases", "mean")).toEqual([]);
  });

  it("prints the count for Frequency and the wait for Waiting time", () => {
    expect(edgeLines("frequency", counts, wait, groups, "events", "mean")[0].value).toBe("6");
    expect(edgeLines("waiting", counts, wait, groups, "cases", "median")[0].value).toBe("1s");
  });
});

describe("edgeStroke", () => {
  const groups = [
    { id: "a", name: "Day", color: "group-2" },
    { id: "b", name: "Night", color: "group-6" }
  ];
  const both = { a: { cases: 3, events: 3 }, b: { cases: 2, events: 2 } };
  const test = (effectSize: number, significant = true): Test => ({
    test: "mannwhitney",
    statistic: 0,
    pValue: significant ? 0.001 : 0.4,
    effectSize,
    effectSigned: effectSize,
    significant,
    higher: "a"
  });
  const wait = (t: Test | null) => ({ summaries: {}, test: t });

  it("takes the colour of the one Group that follows the edge", () => {
    expect(edgeStroke({ a: { cases: 0, events: 0 }, b: { cases: 2, events: 2 } }, [], groups)).toBe(
      "var(--group-6)"
    );
  });

  it("stays grey with one Group compared or no significant test", () => {
    expect(edgeStroke({ a: both.a }, [], groups.slice(0, 1))).toBeNull();
    expect(edgeStroke(both, [wait(test(0.6, false))], groups)).toBeNull();
    expect(edgeStroke(both, [], groups)).toBeNull();
  });

  it("reddens with the strongest effect among its significant tests", () => {
    expect(edgeStroke(both, [wait(test(0.05))], groups)).toContain("var(--effect-3) 45%");
    expect(edgeStroke(both, [wait(test(0.6))], groups)).toContain("var(--effect-3) 100%");
    expect(edgeStroke(both, [wait(test(0.05)), wait(test(0.6))], groups)).toContain(
      "var(--effect-3) 100%"
    );
    expect(edgeStroke(both, [wait(test(0.6, false)), wait(test(0.05))], groups)).toContain(
      "var(--effect-3) 45%"
    );
  });
});

describe("perCase", () => {
  const caseCounts = new Map([
    ["a", 1000],
    ["b", 100]
  ]);
  const edges = [
    { counts: { a: { cases: 900, events: 1800 }, b: { cases: 10, events: 10 } } },
    { counts: { a: { cases: 100, events: 100 }, b: { cases: 50, events: 75 } } }
  ];

  it("divides one Group's counts by the cases that Group holds", () => {
    expect(perCase(edges[0].counts, "a", caseCounts)).toEqual({ cases: 0.9, events: 1.8 });
    expect(perCase(edges[0].counts, "b", caseCounts)).toEqual({ cases: 0.1, events: 0.1 });
  });

  it("reads a Group that never got there as zero", () => {
    expect(perCase({}, "a", caseCounts)).toEqual({ cases: 0, events: 0 });
  });

  it("ranks against the busiest share of any Group, so both panels share one scale", () => {
    expect(busiestPerCase(edges, caseCounts, "cases")).toBe(0.9);
    expect(busiestPerCase(edges, caseCounts, "events")).toBe(1.8);
  });
});

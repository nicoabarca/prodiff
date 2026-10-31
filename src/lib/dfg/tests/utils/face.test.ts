import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import type { Test } from "$lib/analysis/types";
import { edgeStroke, edgeWait, faceCounts, shadeValue } from "$lib/dfg/utils/face";

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
    expect(edgeWait(wait({ b: mean(90_000) }), groups)).toEqual([
      { id: "b", color: "group-6", value: "1m 30s" }
    ]);
  });

  it("labels any wait above zero, printing a sub-second one in ms", () => {
    expect(edgeWait(wait({ b: mean(200) }), groups)).toEqual([
      { id: "b", color: "group-6", value: "200ms" }
    ]);
    expect(edgeWait(wait({ b: mean(0.2) }), groups).map((line) => line.value)).toEqual(["1ms"]);
  });

  it("leaves an edge unlabelled when no Group waited at all", () => {
    expect(edgeWait(wait({ a: mean(0), b: mean(0) }), groups)).toEqual([]);
  });

  it("keeps a Group that did not wait when another Group did", () => {
    expect(
      edgeWait(wait({ a: mean(0), b: mean(5_000) }), groups).map((line) => line.value)
    ).toEqual(["0s", "5s"]);
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
    expect(
      edgeStroke({ a: { cases: 0, events: 0 }, b: { cases: 2, events: 2 } }, undefined, groups)
    ).toBe("var(--group-6)");
  });

  it("stays grey with one Group compared or no significant Waiting Time", () => {
    expect(edgeStroke({ a: both.a }, undefined, groups.slice(0, 1))).toBeNull();
    expect(edgeStroke(both, wait(test(0.6, false)), groups)).toBeNull();
    expect(edgeStroke(both, undefined, groups)).toBeNull();
  });

  it("reddens with the effect of a significant Waiting Time", () => {
    expect(edgeStroke(both, wait(test(0.05)), groups)).toContain("var(--effect-4) 25%");
    expect(edgeStroke(both, wait(test(0.6)), groups)).toContain("var(--effect-4) 100%");
  });
});

import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import { edgeWait, faceCounts, shadeValue } from "$lib/dfg/utils/face";

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

  it("leaves an edge unlabelled when the one Group crossing it waited an instant", () => {
    expect(edgeWait(wait({ b: mean(200) }), groups)).toEqual([]);
  });

  it("leaves an edge unlabelled when every Group's wait is instant", () => {
    expect(edgeWait(wait({ a: mean(0), b: mean(300) }), groups)).toEqual([]);
  });

  it("keeps an instant Group's line when another Group waited", () => {
    expect(
      edgeWait(wait({ a: mean(0), b: mean(5_000) }), groups).map((line) => line.value)
    ).toEqual(["0s", "5s"]);
  });
});

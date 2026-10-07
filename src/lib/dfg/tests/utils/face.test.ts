import { describe, expect, it } from "vitest";
import type { AttributeBlock } from "$lib/analysis/types";
import { ACTIVITY_DURATION } from "$lib/analysis/attributes";
import {
  edgeValue,
  edgeWait,
  edgeWidth,
  faceFigures,
  shadeValue,
  waitText,
  EDGE_WIDTH_MIN
} from "$lib/dfg/utils/face";
import { CASES, EVENTS } from "$lib/dfg/utils/measure";

const groups = [
  { id: "selected", name: "Selected", color: "group-a" },
  { id: "original", name: "Original", color: "group-original" }
];

function duration(mean: number, n: number, group = "selected"): AttributeBlock {
  return {
    summaries: {
      [group]: {
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
      }
    },
    test: null
  };
}

describe("faceFigures", () => {
  it("keys displayed figures by Group id", () => {
    const figures = faceFigures(
      {
        counts: { original: { cases: 4, events: 7 }, selected: { cases: 0, events: 2 } },
        attributes: {}
      },
      groups,
      CASES
    );

    expect(figures).toEqual({ selected: null, original: "4" });
  });

  it("prints an attribute as its own unit", () => {
    const figures = faceFigures(
      {
        counts: { selected: { cases: 2, events: 2 } },
        attributes: { [ACTIVITY_DURATION]: duration(90_000, 2) }
      },
      groups,
      { kind: "attribute", name: ACTIVITY_DURATION }
    );

    expect(figures).toEqual({ selected: "1m 30s", original: null });
  });
});

describe("shadeValue", () => {
  const counts = { a: { cases: 3, events: 9 }, b: { cases: 2, events: 4 } };

  it("is the union across the Groups in the measure shown", () => {
    expect(shadeValue({ kind: "activity", counts, attributes: {} }, CASES)).toBe(5);
    expect(shadeValue({ kind: "activity", counts, attributes: {} }, EVENTS)).toBe(13);
  });

  it("is missing for Start and End", () => {
    expect(shadeValue({ kind: "start", counts, attributes: {} }, CASES)).toBeNull();
    expect(shadeValue({ kind: "end", counts, attributes: {} }, CASES)).toBeNull();
  });

  it("is missing where nothing reached the node", () => {
    expect(
      shadeValue(
        { kind: "activity", counts: { a: { cases: 0, events: 0 } }, attributes: {} },
        CASES
      )
    ).toBeNull();
  });
});

describe("edgeValue", () => {
  const counts = { a: { cases: 3, events: 9 } };
  const wait = duration(60_000, 3);

  it("is the frequency unless a wait is asked for", () => {
    expect(edgeValue(counts, wait, "frequency", "events")).toBe(9);
  });

  it("is the mean wait over every case that ran the pair", () => {
    expect(edgeValue(counts, wait, "wait", "cases")).toBe(60_000);
  });

  it("is nothing for a pair with no wait measured, so one canvas keeps one unit", () => {
    expect(edgeValue(counts, undefined, "wait", "cases")).toBe(0);
    expect(edgeWidth(0, 60_000)).toBe(EDGE_WIDTH_MIN);
  });
});

describe("edgeWait", () => {
  const wait = (selectedMean: number, originalMean: number): AttributeBlock => ({
    summaries: {
      ...duration(selectedMean, 2).summaries,
      ...duration(originalMean, 2, "original").summaries
    },
    test: null
  });

  it("gives one part per Group, each in its own colour", () => {
    const label = edgeWait(wait(24_000, 20_000), groups);

    expect(label?.shared).toBe(false);
    expect(label?.parts).toEqual([
      { id: "selected", color: "group-a", text: "24s" },
      { id: "original", color: "group-original", text: "20s" }
    ]);
    expect(waitText(label!)).toBe("24s · 20s");
  });

  it("says so when every Group waited the same, so one figure can stand for all", () => {
    const label = edgeWait(wait(0, 0), groups);

    expect(label?.shared).toBe(true);
    expect(waitText(label!)).toBe("0s");
  });

  it("gives the one Group that measured a wait", () => {
    expect(edgeWait(duration(60_000, 2), groups)?.parts).toEqual([
      { id: "selected", color: "group-a", text: "1m 0s" }
    ]);
  });

  it("has nothing where no wait was measured", () => {
    expect(edgeWait(undefined, groups)).toBeNull();
  });
});

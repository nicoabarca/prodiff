import { describe, expect, it } from "vitest";
import type { AttributeBlock, Summary } from "$lib/analysis/types";
import { ACTIVITY_DURATION } from "$lib/analysis/attributes";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import {
  CASES,
  EVENTS,
  facing,
  frequencyOf,
  keptMeasure,
  measureKey,
  measureOptions,
  measureUnion,
  measureValue
} from "$lib/dfg/utils/measure";

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

const block = (summaries: Record<string, Summary>): AttributeBlock => ({ summaries, test: null });

const node = {
  counts: { a: { cases: 4, events: 6 }, b: { cases: 2, events: 2 } },
  attributes: {
    [ACTIVITY_DURATION]: block({ a: numerical(100, 4), b: numerical(200, 1) }),
    Resource: block({ a: { type: "categorical", n: 4, counts: { Ann: 4 } } })
  }
};

const columns: RequestColumnMapping[] = [
  { name: "Amount", role: "other", scope: "event", type: "float" },
  { name: "Resource", role: "other", scope: "event", type: "string" }
];

describe("frequencyOf", () => {
  it("counts an attribute's graph in cases, since an attribute has no frequency", () => {
    expect(frequencyOf(CASES)).toBe("cases");
    expect(frequencyOf(EVENTS)).toBe("events");
    expect(frequencyOf({ kind: "attribute", name: ACTIVITY_DURATION })).toBe("cases");
  });
});

describe("measureValue", () => {
  it("reads a frequency off the fold", () => {
    expect(measureValue(node, "a", EVENTS)).toBe(6);
  });

  it("reads an attribute off the Summary Rust shipped", () => {
    expect(measureValue(node, "b", { kind: "attribute", name: ACTIVITY_DURATION })).toBe(200);
  });

  it("has nothing for a Group the measure never reached", () => {
    expect(measureValue(node, "b", { kind: "attribute", name: "Resource" })).toBeNull();
    expect(measureValue({ counts: {}, attributes: {} }, "a", CASES)).toBeNull();
  });
});

describe("measureUnion", () => {
  it("sums a frequency over the Groups", () => {
    expect(measureUnion(node, CASES)).toBe(6);
  });

  it("pools an attribute over every case the Groups hold", () => {
    expect(measureUnion(node, { kind: "attribute", name: ACTIVITY_DURATION })).toBe(120);
  });

  it("has nothing for an attribute the build never measured", () => {
    expect(measureUnion(node, { kind: "attribute", name: "Amount" })).toBeNull();
  });
});

describe("measureOptions", () => {
  it("offers the frequencies and the numeric attributes only", () => {
    expect(
      measureOptions(columns, ["Amount", "Resource", ACTIVITY_DURATION]).map(measureKey)
    ).toEqual(["cases", "events", "attribute:Amount", `attribute:${ACTIVITY_DURATION}`]);
  });
});

describe("keptMeasure", () => {
  it("falls back to cases once the attribute leaves the build", () => {
    const options = measureOptions(columns, ["Amount"]);
    expect(keptMeasure({ kind: "attribute", name: "Amount" }, options)).toEqual({
      kind: "attribute",
      name: "Amount"
    });
    expect(keptMeasure({ kind: "attribute", name: ACTIVITY_DURATION }, options)).toEqual(CASES);
  });
});

describe("facing", () => {
  it("drops every other Group, so a split panel ranks within its own", () => {
    const narrowed = facing(node, "b");

    expect(narrowed.counts).toEqual({ b: { cases: 2, events: 2 } });
    expect(measureUnion(narrowed, { kind: "attribute", name: ACTIVITY_DURATION })).toBe(200);
  });

  it("passes the whole comparison through", () => {
    expect(facing(node, null)).toBe(node);
  });
});

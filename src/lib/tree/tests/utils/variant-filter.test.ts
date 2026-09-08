import { describe, expect, it } from "vitest";
import {
  activityOptions,
  filterVariants,
  matchesSequence,
  sameSelection
} from "$lib/tree/utils/variant-filter";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";

function row(key: string, activities: string[]): ResponseVariantRow {
  return { key, activities, cases: { original: 1 } };
}

describe("matchesSequence", () => {
  it("matches an empty sequence against anything", () => {
    expect(matchesSequence(["A"], [])).toBe(true);
    expect(matchesSequence([], [])).toBe(true);
  });

  it("allows gaps between the steps", () => {
    expect(matchesSequence(["A", "X", "B", "Y", "C"], ["A", "B", "C"])).toBe(true);
  });

  it("requires the order the sequence gives", () => {
    expect(matchesSequence(["C", "B", "A"], ["A", "B", "C"])).toBe(false);
  });

  it("rejects a trace missing a step", () => {
    expect(matchesSequence(["A", "C"], ["A", "B", "C"])).toBe(false);
  });

  it("rejects a trace shorter than the sequence", () => {
    expect(matchesSequence([], ["A"])).toBe(false);
  });

  it("reads a repeated activity as two steps to satisfy", () => {
    expect(matchesSequence(["A", "B", "A"], ["A", "A"])).toBe(true);
    expect(matchesSequence(["A", "B"], ["A", "A"])).toBe(false);
  });

  it("matches when the sequence is the whole trace", () => {
    expect(matchesSequence(["A", "B"], ["A", "B"])).toBe(true);
  });
});

describe("filterVariants", () => {
  const rows = [row("v1", ["A", "B", "C"]), row("v2", ["A", "C"]), row("v3", ["B", "A"])];

  it("returns every row for an empty sequence", () => {
    expect(filterVariants(rows, [])).toBe(rows);
  });

  it("keeps only the rows running through the sequence", () => {
    expect(filterVariants(rows, ["A", "C"]).map((r) => r.key)).toEqual(["v1", "v2"]);
  });

  it("returns nothing when no row matches", () => {
    expect(filterVariants(rows, ["C", "B"])).toEqual([]);
  });
});

describe("activityOptions", () => {
  it("lists every activity once, alphabetically", () => {
    const rows = [row("v1", ["Ship", "Pack"]), row("v2", ["Pack", "Approve"])];
    expect(activityOptions(rows)).toEqual(["Approve", "Pack", "Ship"]);
  });

  it("is empty for no rows", () => {
    expect(activityOptions([])).toEqual([]);
  });
});

describe("sameSelection", () => {
  it("ignores order", () => {
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("sees a different size as different", () => {
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
  });

  it("sees the same size with different members as different", () => {
    expect(sameSelection(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("reads duplicates as one member", () => {
    expect(sameSelection(["a", "a"], ["a"])).toBe(true);
  });

  it("compares a Set to an array", () => {
    expect(sameSelection(new Set(["a", "b"]), ["b", "a"])).toBe(true);
  });

  it("holds for two empty selections", () => {
    expect(sameSelection([], [])).toBe(true);
  });
});

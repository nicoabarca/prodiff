import { describe, expect, it } from "vitest";
import { cutVariants, shapeOf } from "$lib/dfg/utils/cut";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";

/** Rows as `list_variants` ships them, biggest first. */
function rowsOf(variants: [string, Record<string, number>][]): ResponseVariantRow[] {
  return variants.map(([trace, cases]) => ({
    key: [...trace].join("\u{1}"),
    activities: [...trace],
    cases
  }));
}

const keys = (...traces: string[]) => new Set(traces.map((trace) => [...trace].join("\u{1}")));

const cut = (rows: ResponseVariantRow[], coverage: number, paths: number, groups = ["a"]) =>
  cutVariants(rows, coverage, paths, groups, "cases");

describe("cutVariants", () => {
  it("stages every Variant at full coverage and every path", () => {
    const rows = rowsOf([
      ["AB", { a: 3 }],
      ["AC", { a: 1 }]
    ]);

    expect(cut(rows, 1, 1)).toEqual(keys("AB", "AC"));
  });

  it("stages the single most travelled Variant at the bottom of Behaviour", () => {
    const rows = rowsOf([
      ["AB", { a: 10 }],
      ["AC", { a: 1 }]
    ]);

    expect(cut(rows, 0, 1)).toEqual(keys("AB"));
  });

  it("takes a Variant whole, so a run of activities arrives at once", () => {
    const rows = rowsOf([
      ["AB", { a: 60 }],
      ["ACDE", { a: 40 }]
    ]);

    expect(cut(rows, 0.5, 1)).toEqual(keys("AB"));
    expect(cut(rows, 0.7, 1)).toEqual(keys("AB", "ACDE"));
  });

  it("drops a Variant one of whose transitions the Paths cut removed", () => {
    const rows = rowsOf([
      ["ABCD", { a: 9 }],
      ["ACBD", { a: 1 }]
    ]);

    expect(cut(rows, 1, 0)).toEqual(keys("ABCD"));
  });

  it("keeps a Variant every one of whose transitions is some activity's busiest", () => {
    const rows = rowsOf([
      ["ABD", { a: 20 }],
      ["ACD", { a: 15 }]
    ]);

    expect(cut(rows, 1, 0)).toEqual(keys("ABD", "ACD"));
  });

  it("ranks transitions inside each Group so the smaller one is not drowned", () => {
    // Group b is a hundredth the size of a, and takes a route a never takes.
    const rows = rowsOf([
      ["AB", { a: 500 }],
      ["AC", { a: 400 }],
      ["AD", { b: 5 }]
    ]);

    expect(cut(rows, 1, 0.34, ["a", "b"])).toContain([..."AD"].join("\u{1}"));
  });

  it("always leaves one Variant to apply", () => {
    const rows = rowsOf([
      ["ABAB", { a: 5 }],
      ["BABA", { a: 5 }]
    ]);

    expect(cut(rows, 1, 0).size).toBeGreaterThan(0);
  });

  it("stages nothing from an empty list", () => {
    expect(cut([], 1, 1).size).toBe(0);
  });
});

describe("shapeOf", () => {
  it("counts the activities and paths a set of Variants draws", () => {
    const rows = rowsOf([
      ["AB", { a: 3 }],
      ["AC", { a: 1 }]
    ]);

    // Start to A, A to B, A to C, B to End, C to End.
    expect(shapeOf(rows)).toEqual({ activities: 3, paths: 5 });
  });
});

import { describe, expect, it } from "vitest";
import type { Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID } from "$lib/dfg/types";
import { cutPaths, stepCoverage, stepPaths } from "$lib/dfg/utils/cut";
import { fold, type FoldedEdge } from "$lib/dfg/utils/fold";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";
import { variantsCovering } from "$lib/tree/utils/variants";

const A = 2;
const B = 3;
const C = 4;
const D = 5;

/** Rows as `list_variants` ships them, biggest first. */
function rowsOf(variants: [string, Record<string, number>][]): ResponseVariantRow[] {
  return variants.map(([trace, cases]) => ({
    key: [...trace].join("\u{1}"),
    activities: [...trace],
    cases
  }));
}

function edgesOf(variants: [number[], Record<string, number>][]): FoldedEdge[] {
  const built: Variant[] = variants.map(([activities, cases]) => ({ activities, cases }));
  return fold(built).edges;
}

const pairs = (of: FoldedEdge[]) => of.map(({ source, target }) => `${source}->${target}`);

const isInner = (edge: FoldedEdge) => edge.source !== START_ID && edge.target !== END_ID;

describe("cutPaths", () => {
  const edges = edgesOf([
    [[A, B, D], { a: 90 }],
    [[A, C, D], { a: 9 }],
    [[A, B, C, D], { a: 1 }]
  ]);

  it("keeps every edge at the top of the slider", () => {
    expect(cutPaths(edges, ["a"], 1, "cases")).toEqual(edges);
  });

  it("hides the rarer edges between activities and never adds one", () => {
    const kept = cutPaths(edges, ["a"], 0, "cases");

    expect(pairs(kept)).not.toContain(`${B}->${C}`);
    expect(pairs(edges)).toEqual(expect.arrayContaining(pairs(kept)));
  });

  it("keeps every edge from Start and into End", () => {
    const kept = cutPaths(edges, ["a"], 0, "cases");

    expect(kept.filter((edge) => !isInner(edge))).toEqual(edges.filter((edge) => !isInner(edge)));
  });

  it("leaves every activity a way in and a way out", () => {
    const kept = cutPaths(edges, ["a"], 0, "cases");

    for (const id of [B, C]) {
      expect(kept.some((edge) => edge.target === id)).toBe(true);
      expect(kept.some((edge) => edge.source === id)).toBe(true);
    }
  });

  it("ranks edges inside each Group so the smaller one is not drowned", () => {
    // Group b is a hundredth the size of a, and takes a route a never takes.
    const mixed = edgesOf([
      [[A, B, D], { a: 500 }],
      [[A, C, D], { a: 400 }],
      [[A, D], { b: 5 }]
    ]);

    expect(pairs(cutPaths(mixed, ["a", "b"], 0.34, "cases"))).toContain(`${A}->${D}`);
  });
});

describe("stepCoverage", () => {
  const rows = rowsOf([
    ["AB", { a: 60 }],
    ["AC", { a: 30 }],
    ["AD", { a: 10 }]
  ]);

  it("adds exactly the next most common Variant", () => {
    const next = stepCoverage(rows, 60, 1);

    expect(variantsCovering(rows, next / 100).size).toBe(2);
  });

  it("drops exactly the least common Variant staged", () => {
    const next = stepCoverage(rows, 100, -1);

    expect(variantsCovering(rows, next / 100).size).toBe(2);
  });

  it("never stages fewer than one Variant", () => {
    const next = stepCoverage(rows, 60, -1);

    expect(variantsCovering(rows, next / 100).size).toBe(1);
  });
});

describe("stepPaths", () => {
  const edges = edgesOf([
    [[A, B, D], { a: 90 }],
    [[A, C, D], { a: 9 }],
    [[A, B, C, D], { a: 1 }]
  ]);

  it("moves to the nearest share that draws a different number of edges", () => {
    const drawn = (share: number) => cutPaths(edges, ["a"], share / 100, "cases").length;
    const next = stepPaths(edges, ["a"], 100, "cases", -1);

    expect(drawn(next)).toBeLessThan(drawn(100));
    expect(drawn(next + 1)).toBe(drawn(100));
  });

  it("stays put when nothing further changes", () => {
    expect(stepPaths(edges, ["a"], 100, "cases", 1)).toBe(100);
  });
});

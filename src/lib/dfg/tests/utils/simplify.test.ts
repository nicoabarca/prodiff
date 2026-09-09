import { describe, expect, it } from "vitest";
import type { Counts, DfgNode, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, defaultDfgView, type DfgView } from "$lib/dfg/types";
import { simplify } from "$lib/dfg/utils/simplify";

const A = 2;
const B = 3;
const C = 4;
const D = 5;
const E = 6;

const label = new Map([
  [A, "A"],
  [B, "B"],
  [C, "C"],
  [D, "D"],
  [E, "E"]
]);

/**
 * A graph as Rust would ship it. Node counts are summed from the variants, the
 * way the real payload has them.
 */
function graphOf(variants: [number[], Record<string, number>][]): ResponseDfg {
  const built: Variant[] = variants.map(([activities, cases]) => ({ activities, cases }));
  const counts = new Map<number, Record<string, Counts>>();
  for (const variant of built) {
    for (const [group, cases] of Object.entries(variant.cases)) {
      for (const activity of new Set(variant.activities)) {
        const at = counts.get(activity) ?? {};
        const times = variant.activities.filter((one) => one === activity).length;
        const found = at[group] ?? { cases: 0, events: 0 };
        at[group] = { cases: found.cases + cases, events: found.events + cases * times };
        counts.set(activity, at);
      }
    }
  }

  const nodes: DfgNode[] = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, counts]) => ({
      id,
      label: label.get(id) ?? String(id),
      counts,
      attributes: {}
    }));

  const groups = [...new Set(built.flatMap((variant) => Object.keys(variant.cases)))].map((id) => ({
    id
  }));

  return {
    nodes,
    variants: built,
    transitions: [],
    groups,
    overlapCases: 0,
    skippedCaseLevel: []
  };
}

const view = (over: Partial<DfgView> = {}): DfgView => ({ ...defaultDfgView, ...over });

const pairs = (of: { source: number; target: number }[]) =>
  of.map(({ source, target }) => `${source}->${target}`);

describe("simplify", () => {
  it("draws the whole log at full coverage", () => {
    const graph = graphOf([
      [[A, B], { a: 3 }],
      [[A, C], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ coverage: 1, paths: 1 }));

    expect(simplified.variants).toMatchObject({ shown: 2, total: 2, cases: 4, totalCases: 4 });
    expect(simplified.activities).toEqual({ shown: 3, total: 3 });
    expect(pairs(simplified.edges)).toContain(`${A}->${C}`);
  });

  it("draws the single most travelled shape at the bottom of the slider", () => {
    const graph = graphOf([
      [[A, B], { a: 10 }],
      [[A, C], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ coverage: 0 }));

    expect(simplified.variants.shown).toBe(1);
    expect(pairs(simplified.edges)).toEqual([`${START_ID}->${A}`, `${A}->${B}`, `${B}->${END_ID}`]);
  });

  it("takes a shape whole, so a run of activities arrives at once", () => {
    const graph = graphOf([
      [[A, B], { a: 60 }],
      [[A, C, D, E], { a: 40 }]
    ]);

    expect(simplify(graph, view({ coverage: 0.5 })).activities.shown).toBe(2);

    const more = simplify(graph, view({ coverage: 0.7 }));
    expect(more.activities.shown).toBe(5);
    expect(more.variants.shown).toBe(2);
  });

  it("never invents a pair the log never ran", () => {
    // A is followed by C only through B, so A to C is not something this log
    // does, whatever the sliders say.
    const graph = graphOf([
      [[A, B, C], { a: 90 }],
      [[A, D], { a: 10 }]
    ]);

    for (const coverage of [0, 0.5, 1]) {
      const simplified = simplify(graph, view({ coverage, paths: 1 }));
      expect(pairs(simplified.edges)).not.toContain(`${A}->${C}`);
    }
  });

  it("never ends on an activity no case ends on", () => {
    const graph = graphOf([
      [[A, B, C], { a: 90 }],
      [[A, B, D], { a: 10 }]
    ]);

    for (const coverage of [0, 0.5, 1]) {
      const simplified = simplify(graph, view({ coverage, paths: 1 }));
      for (const edge of simplified.edges.filter((one) => one.target === END_ID)) {
        expect([C, D]).toContain(edge.source);
      }
    }
  });

  it("reports the coverage it bought rather than the one it was asked for", () => {
    const graph = graphOf([
      [[A, B], { a: 70 }],
      [[A, C], { a: 30 }]
    ]);

    const simplified = simplify(graph, view({ coverage: 0.5 }));

    // One shape covers 70 of the 100 cases, which is already past the half.
    expect(simplified.variants).toMatchObject({ shown: 1, cases: 70, totalCases: 100 });
  });

  it("never cuts the edges out of Start or into End", () => {
    const graph = graphOf([
      [[A, B], { a: 10 }],
      [[C, D], { a: 9 }]
    ]);

    const simplified = simplify(graph, view({ coverage: 1, paths: 0 }));

    for (const activity of [A, C]) {
      expect(pairs(simplified.edges)).toContain(`${START_ID}->${activity}`);
    }
    for (const activity of [B, D]) {
      expect(pairs(simplified.edges)).toContain(`${activity}->${END_ID}`);
    }
  });

  it("leaves every activity a way in and a way out at the lowest detail", () => {
    const graph = graphOf([
      [[A, B, D], { a: 20 }],
      [[A, C, D], { a: 15 }]
    ]);

    const simplified = simplify(graph, view({ coverage: 1, paths: 0 }));

    for (const node of simplified.nodes) {
      if (node.kind !== "activity") continue;
      expect(simplified.edges.some((edge) => edge.target === node.id)).toBe(true);
      expect(simplified.edges.some((edge) => edge.source === node.id)).toBe(true);
    }
  });

  it("ranks paths inside each Group so the smaller one is not drowned", () => {
    // Group b is a hundredth the size of a, and takes a route a never takes.
    const graph = graphOf([
      [[A, B], { a: 500 }],
      [[A, C], { a: 400 }],
      [[A, D], { b: 5 }]
    ]);

    const simplified = simplify(graph, view({ coverage: 1, paths: 0.34, measure: "cases" }));

    expect(pairs(simplified.edges)).toContain(`${A}->${D}`);
  });
});

import { describe, expect, it } from "vitest";
import type { Counts, DfgNode, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, defaultDfgView, type DfgView } from "$lib/dfg/types";
import { simplify } from "$lib/dfg/utils/simplify";

const A = 2;
const B = 3;
const C = 4;
const D = 5;

const label = new Map([
  [A, "A"],
  [B, "B"],
  [C, "C"],
  [D, "D"]
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
    id,
    caseCount: 0
  }));

  return {
    nodes,
    variants: built,
    transitions: [],
    groups,
    comparing: groups.length > 1,
    overlapCases: 0,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false,
    skippedCaseLevel: []
  };
}

const view = (over: Partial<DfgView> = {}): DfgView => ({ ...defaultDfgView, ...over });

const pairs = (of: { source: number; target: number }[]) =>
  of.map(({ source, target }) => `${source}->${target}`);

describe("simplify", () => {
  it("draws everything at full detail", () => {
    const graph = graphOf([
      [[A, B], { a: 3 }],
      [[A, C], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ activities: 1, paths: 1 }));

    expect(simplified.activities).toEqual({ shown: 3, total: 3 });
    expect(simplified.paths.shown).toBe(simplified.paths.total);
    expect(pairs(simplified.edges)).toContain(`${A}->${C}`);
  });

  it("drops the least travelled activity first", () => {
    const graph = graphOf([
      [[A, B], { a: 10 }],
      [[A, C], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ activities: 0.5 }));

    const drawn = simplified.nodes.map((node) => node.label);
    expect(drawn).toContain("A");
    expect(drawn).toContain("B");
    expect(drawn).not.toContain("C");
    expect(simplified.activities).toEqual({ shown: 2, total: 3 });
  });

  it("re-links the cases of a dropped activity rather than losing them", () => {
    const graph = graphOf([
      [[A, B, C], { a: 9 }],
      [[A, C], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ activities: 0.5, paths: 1 }));

    // B is the middle of every busy trace, so A and C outrank it and it goes.
    const edge = simplified.edges.find((one) => one.source === A && one.target === C);
    expect(edge?.counts.a.cases).toBe(10);
  });

  it("never cuts the edges into Start or out of End", () => {
    const graph = graphOf([
      [[A, B], { a: 10 }],
      [[C, D], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ paths: 0 }));

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
      [[A, C, D], { a: 1 }]
    ]);

    const simplified = simplify(graph, view({ paths: 0 }));

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

    const simplified = simplify(graph, view({ paths: 0.34, measure: "cases" }));

    expect(pairs(simplified.edges)).toContain(`${A}->${D}`);
  });

  it("counts the paths it kept against the paths that were there to keep", () => {
    const graph = graphOf([
      [[A, B], { a: 5 }],
      [[A, C], { a: 4 }],
      [[A, D], { a: 3 }]
    ]);

    const simplified = simplify(graph, view({ paths: 0.5 }));

    expect(simplified.paths.shown).toBeLessThanOrEqual(simplified.paths.total);
    expect(simplified.paths.total).toBeGreaterThan(0);
  });
});

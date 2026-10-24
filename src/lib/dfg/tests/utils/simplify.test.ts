import { describe, expect, it } from "vitest";
import type { Counts, DfgNode, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
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
    caseLevel: {}
  };
}

const pairs = (of: { source: number; target: number }[]) =>
  of.map(({ source, target }) => `${source}->${target}`);

const keyOf = (activities: number[]) => activities.map((id) => label.get(id)).join("\u{1}");

describe("simplify", () => {
  it("draws every Variant the graph was built from", () => {
    const graph = graphOf([
      [[A, B], { a: 3 }],
      [[A, C], { a: 1 }]
    ]);

    const simplified = simplify(graph);

    expect(simplified.variants).toMatchObject({ count: 2, cases: 4 });
    expect(simplified.nodes.filter((node) => node.kind === "activity")).toHaveLength(3);
    expect(pairs(simplified.edges)).toContain(`${A}->${C}`);
  });

  it("never invents a pair the log never ran", () => {
    // A is followed by C only through B, so A to C is not something this log does.
    const graph = graphOf([
      [[A, B, C], { a: 90 }],
      [[A, D], { a: 10 }]
    ]);

    expect(pairs(simplify(graph).edges)).not.toContain(`${A}->${C}`);
  });

  it("keys every Variant it draws the way the picker does", () => {
    const graph = graphOf([
      [[A, B], { a: 3 }],
      [[A, C, D, E], { b: 1 }]
    ]);

    expect(simplify(graph).variants.keys).toEqual(new Set([keyOf([A, B]), keyOf([A, C, D, E])]));
  });
});

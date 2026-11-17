import { describe, expect, it } from "vitest";
import { END_ID, START_ID } from "$lib/dfg/types";
import { previewGraph } from "$lib/dfg/utils/preview";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";

function rowsOf(variants: [string[], Record<string, number>][]): ResponseVariantRow[] {
  return variants.map(([activities, cases]) => ({
    key: activities.join("\u{1}"),
    activities,
    cases
  }));
}

const rows = rowsOf([
  [["Mix", "Bake"], { a: 6, b: 2 }],
  [["Mix", "Cut", "Bake"], { b: 3 }],
  [["Mix", "Fry"], { a: 1 }]
]);
const picked = new Set([rows[0].key, rows[1].key]);

describe("previewGraph", () => {
  it("numbers the activities the way Rust does, by sorted label above Start and End", () => {
    const graph = previewGraph(rows, picked, ["a", "b"]);

    expect(graph.nodes.map((node) => [node.label, node.id])).toEqual([
      ["Bake", END_ID + 1],
      ["Cut", END_ID + 2],
      ["Mix", END_ID + 3]
    ]);
    expect(graph.nodes.map((node) => node.id)).not.toContain(START_ID);
  });

  it("draws only the picked Variants and counts their cases per Group", () => {
    const graph = previewGraph(rows, picked, ["a", "b"]);

    expect(graph.variants).toHaveLength(2);
    expect(graph.groups).toEqual([
      { id: "a", caseCount: 6 },
      { id: "b", caseCount: 5 }
    ]);
    expect(graph.nodes.find((node) => node.label === "Cut")?.counts).toEqual({
      b: { cases: 3, events: 3 }
    });
  });

  it("carries nothing measured or tested", () => {
    const graph = previewGraph(rows, picked, ["a", "b"]);

    expect(graph.transitions).toEqual([]);
    expect(graph.caseLevel).toEqual({});
    expect(graph.nodes.every((node) => Object.keys(node.attributes).length === 0)).toBe(true);
  });
});

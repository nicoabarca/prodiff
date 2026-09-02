import { describe, expect, it } from "vitest";
import type { Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID } from "$lib/dfg/types";
import { edgeId, fold } from "$lib/dfg/utils/fold";

const A = 2;
const B = 3;
const C = 4;

/** One trace shape and how many cases of each Group ran it. */
function variant(activities: number[], cases: Record<string, number>): Variant {
  return { activities, cases };
}

const edge = (folded: ReturnType<typeof fold>, source: number, target: number) =>
  folded.edges.find((candidate) => candidate.source === source && candidate.target === target);

describe("fold", () => {
  it("runs a trace from Start to End", () => {
    const folded = fold([variant([A, B], { a: 1 })]);

    expect(folded.edges.map((e) => edgeId(e.source, e.target))).toEqual([
      edgeId(START_ID, A),
      edgeId(A, B),
      edgeId(B, END_ID)
    ]);
    expect(edge(folded, START_ID, A)?.counts.a.cases).toBe(1);
    expect(folded.nodes.get(START_ID)?.a.cases).toBe(1);
    expect(folded.nodes.get(END_ID)?.a.cases).toBe(1);
  });

  it("counts a case once however many times it ran the pair", () => {
    const folded = fold([variant([A, B, A, B], { a: 3 })]);

    expect(folded.nodes.get(A)?.a).toEqual({ cases: 3, events: 6 });
    expect(edge(folded, A, B)?.counts.a).toEqual({ cases: 3, events: 6 });
    expect(edge(folded, B, A)?.counts.a).toEqual({ cases: 3, events: 3 });
  });

  it("only ever draws a pair a case actually ran", () => {
    const folded = fold([variant([A, B, C], { a: 5 }), variant([A, C], { a: 2 })]);

    expect(edge(folded, A, C)?.counts.a.cases).toBe(2);
    expect(edge(folded, A, B)?.counts.a.cases).toBe(5);
    expect(edge(folded, B, C)?.counts.a.cases).toBe(5);
  });

  it("keys every Group separately", () => {
    const folded = fold([variant([A, B], { a: 2, b: 5 })]);

    expect(edge(folded, A, B)?.counts).toEqual({
      a: { cases: 2, events: 2 },
      b: { cases: 5, events: 5 }
    });
  });

  it("counts a one-activity trace on both boundaries", () => {
    const folded = fold([variant([A], { a: 4 })]);

    expect(folded.nodes.get(START_ID)?.a.cases).toBe(4);
    expect(folded.nodes.get(END_ID)?.a.cases).toBe(4);
    expect(edge(folded, START_ID, A)?.counts.a.cases).toBe(4);
    expect(edge(folded, A, END_ID)?.counts.a.cases).toBe(4);
  });

  it("keeps a self-loop as its own edge", () => {
    const folded = fold([variant([A, A], { a: 1 })]);

    expect(edge(folded, A, A)?.counts.a).toEqual({ cases: 1, events: 1 });
    expect(folded.nodes.get(A)?.a.events).toBe(2);
  });
});

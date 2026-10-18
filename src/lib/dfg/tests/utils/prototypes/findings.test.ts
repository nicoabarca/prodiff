import { describe, expect, it } from "vitest";
import type { AttributeBlock, Test } from "$lib/analysis/types";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { atNode, graphFindings, rank, spread } from "$lib/dfg/utils/prototypes/findings";

const test = (effectSize: number, pValue: number, significant = true): Test => ({
  test: "mannwhitney",
  statistic: 1,
  pValue,
  effectSize,
  effectSigned: effectSize,
  significant,
  higher: "a"
});

const block = (t: Test | null): AttributeBlock => ({ summaries: {}, test: t });

const counts = { a: { cases: 1, events: 1 }, b: { cases: 1, events: 1 } };

const graph = {
  nodes: [
    { id: 2, label: "Review", counts, attributes: { Amount: block(test(0.2, 0.01)) } },
    { id: 3, label: "Approve", counts, attributes: { Amount: block(test(0.05, 0.5, false)) } },
    { id: 4, label: "Hidden", counts, attributes: { Amount: block(test(0.9, 0.001)) } }
  ],
  variants: [],
  transitions: [
    { source: 2, target: 3, wait: block(test(0.6, 0.02)) },
    { source: 3, target: 4, wait: block(test(0.7, 0.001)) }
  ],
  groups: [{ id: "a" }, { id: "b" }],
  overlapCases: 0,
  skippedCaseLevel: []
} as ResponseDfg;

const simplified = {
  nodes: [
    { id: 2, label: "Review", kind: "activity", counts },
    { id: 3, label: "Approve", kind: "activity", counts }
  ],
  edges: [{ source: 2, target: 3, counts }]
} as unknown as Simplified;

describe("graphFindings", () => {
  const findings = graphFindings(graph, simplified);

  it("reads only the activities and edges the graph draws", () => {
    expect(findings.map((f) => f.place.label)).toEqual(["Review", "Approve", "Review → Approve"]);
  });

  it("tests an edge on its Waiting Time", () => {
    expect(findings[2].attribute).toBe("Transition Time");
  });

  it("ranks significant tests first, then by effect or by p-value", () => {
    expect(rank(findings, "effect").map((f) => f.place.label)).toEqual([
      "Review → Approve",
      "Review",
      "Approve"
    ]);
    expect(rank(findings, "pValue").map((f) => f.place.label)).toEqual([
      "Review",
      "Review → Approve",
      "Approve"
    ]);
  });

  it("counts per attribute how many tested places differ", () => {
    const amount = spread(findings).find((row) => row.attribute === "Amount");
    expect(amount).toMatchObject({ tested: 2, significant: 1 });
    expect(amount?.peak?.place.label).toBe("Review");
  });

  it("splits a node's findings into its own and its edges' in and out", () => {
    const here = atNode(findings, 3);
    expect(here.own).toHaveLength(1);
    expect(here.into.map((f) => f.place.label)).toEqual(["Review → Approve"]);
    expect(here.outOf).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { AttributeBlock, Test } from "$lib/analysis/types";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { byAttribute, graphFindings, nodeDifferences, rank } from "$lib/dfg/utils/findings";

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

  it("leaves out an activity one Group alone reaches, but keeps the waits around it", () => {
    const lone = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 5,
          label: "Escalate",
          counts: { a: { cases: 3, events: 3 }, b: { cases: 0, events: 0 } },
          attributes: { Amount: block(test(0.8, 0.001)) }
        }
      ],
      transitions: [...graph.transitions, { source: 2, target: 5, wait: block(test(0.4, 0.01)) }]
    } as ResponseDfg;
    const drawn = {
      ...simplified,
      nodes: [
        ...simplified.nodes,
        { id: 5, label: "Escalate", kind: "activity", counts: lone.nodes[3].counts }
      ],
      edges: [...simplified.edges, { source: 2, target: 5, counts }]
    } as unknown as Simplified;
    const found = graphFindings(lone, drawn);
    expect(found.map((f) => f.place.label)).toEqual([
      "Review",
      "Approve",
      "Review → Approve",
      "Review → Escalate"
    ]);
    expect(nodeDifferences(found).has(5)).toBe(false);
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

  it("lists every place under its attribute, with how many differ", () => {
    const rows = byAttribute(findings, "effect");
    expect(rows.map((row) => row.attribute)).toEqual(["Transition Time", "Amount"]);
    const amount = rows[1];
    expect(amount).toMatchObject({ tested: 2, significant: 1 });
    expect(amount.places.map((f) => f.place.label)).toEqual(["Review", "Approve"]);
    expect(amount.peak?.place.label).toBe("Review");
  });
});

describe("nodeDifferences", () => {
  it("counts each activity's significant findings and keeps the strongest effect", () => {
    const review = { kind: "node" as const, id: 2, label: "Review" };
    const differences = nodeDifferences([
      { key: "1", place: review, attribute: "Amount", block: block(test(0.2, 0.01)) },
      { key: "2", place: review, attribute: "Region", block: block(test(0.6, 0.01)) },
      { key: "3", place: review, attribute: "Cost", block: block(test(0.9, 0.5, false)) },
      ...graphFindings(graph, simplified).filter((f) => f.place.kind === "edge")
    ]);
    expect([...differences.entries()]).toEqual([[2, { count: 2, peak: 0.6 }]]);
  });
});

import { describe, expect, it } from "vitest";
import type { AttributeBlock, Test } from "$lib/analysis/types";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import { ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS } from "$lib/dfg/types";
import {
  activityDifferences,
  byAttribute,
  builtInVerdict,
  graphFindings,
  nodeDifferences,
  rank,
  testedPlaces
} from "$lib/dfg/utils/findings";

const test = (effectSize: number, pValue: number, significant = true): Test => ({
  test: "mannwhitney",
  statistic: 1,
  pValue,
  effectSize,
  effectSigned: effectSize,
  significant,
  approximate: false,
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
    { source: 2, target: 3, attributes: { [TRANSITION_TIME]: block(test(0.6, 0.02)) } },
    { source: 3, target: 4, attributes: { [TRANSITION_TIME]: block(test(0.7, 0.001)) } }
  ],
  groups: [{ id: "a" }, { id: "b" }],
  overlapCases: 0,
  caseLevel: {}
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

  it("leaves out an activity and an edge one Group alone reaches", () => {
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
      transitions: [
        ...graph.transitions,
        { source: 2, target: 5, attributes: { [TRANSITION_TIME]: block(test(0.4, 0.01)) } },
        { source: 5, target: 3, attributes: { [TRANSITION_TIME]: block(test(0.4, 0.01)) } }
      ]
    } as ResponseDfg;
    const drawn = {
      ...simplified,
      nodes: [
        ...simplified.nodes,
        { id: 5, label: "Escalate", kind: "activity", counts: lone.nodes[3].counts }
      ],
      edges: [
        ...simplified.edges,
        { source: 2, target: 5, counts },
        { source: 5, target: 3, counts: lone.nodes[3].counts }
      ]
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

  it("leaves out even the frequency of a place one Group alone reaches", () => {
    const loneCounts = { a: { cases: 3, events: 3 }, b: { cases: 0, events: 0 } };
    const lone = {
      ...graph,
      nodes: [
        {
          id: 5,
          label: "Escalate",
          counts: loneCounts,
          attributes: {
            Amount: block(test(0.8, 0.001)),
            [ACTIVITY_FREQUENCY]: block(test(0.5, 0.001))
          }
        }
      ],
      transitions: [
        { source: 0, target: 5, attributes: { [EDGE_FREQUENCY]: block(test(0.5, 0.001)) } }
      ]
    } as ResponseDfg;
    const drawn = {
      nodes: [
        { id: 0, label: "Start", kind: "start", counts },
        { id: 5, label: "Escalate", kind: "activity", counts: loneCounts }
      ],
      edges: [{ source: 0, target: 5, counts: loneCounts }]
    } as unknown as Simplified;
    const found = graphFindings(lone, drawn);
    expect(found).toEqual([]);
    expect(testedPlaces(found).size).toBe(0);
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

describe("activityDifferences", () => {
  it("lists one activity's significant findings, strongest effect first", () => {
    const review = { kind: "node" as const, id: 2, label: "Review" };
    const found = activityDifferences(
      [
        { key: "1", place: review, attribute: "Amount", block: block(test(0.2, 0.01)) },
        { key: "2", place: review, attribute: "Region", block: block(test(0.6, 0.04)) },
        { key: "3", place: review, attribute: "Cost", block: block(test(0.9, 0.5, false)) },
        ...graphFindings(graph, simplified).filter((f) => f.place.label !== "Review")
      ],
      2
    );
    expect(found.map((f) => f.attribute)).toEqual(["Region", "Amount"]);
  });
});

describe("builtInVerdict", () => {
  const groups = [
    { id: "a", name: "Day" },
    { id: "b", name: "Night" }
  ];
  const reach = (higher: string, significant = true): AttributeBlock => ({
    summaries: {
      a: { type: "categorical", n: 100, counts: { Reached: 72, "Not reached": 28 } },
      b: { type: "categorical", n: 50, counts: { Reached: 30, "Not reached": 20 } }
    },
    test: { ...test(0.13, 0.01, significant), test: "chi2", effectSigned: null, higher }
  });

  it("names the Group that reaches it more often, with both shares in order", () => {
    expect(builtInVerdict(ACTIVITY_FREQUENCY, reach("a"), groups)).toBe(
      "Day more often · 72% vs 60%"
    );
  });

  it("says nothing for a frequency that is not significant or another attribute", () => {
    expect(builtInVerdict(ACTIVITY_FREQUENCY, reach("a", false), groups)).toBeNull();
    expect(builtInVerdict("Amount", reach("a"), groups)).toBeNull();
  });
});

describe("builtInVerdict on Repetitions", () => {
  const groups = [
    { id: "a", name: "Day" },
    { id: "b", name: "Night" }
  ];
  const numeric = (mean: number) => ({
    type: "numerical" as const,
    n: 10,
    mean,
    std: 1,
    min: 1,
    q1: 1,
    median: 1,
    q3: 2,
    max: 4,
    whiskerLow: 1,
    whiskerHigh: 4,
    outliersLow: 0,
    outliersHigh: 0
  });

  it("names the Group that repeats the activity more, with both means", () => {
    const block: AttributeBlock = {
      summaries: { a: numeric(2.14), b: numeric(1.6) },
      test: test(0.3, 0.001)
    };
    expect(builtInVerdict(REPETITIONS, block, groups)).toMatch(
      /^Day repeats it more · 2[.,]1 vs 1[.,]6 times on average$/
    );
  });
});

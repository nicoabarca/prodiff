import { describe, expect, it } from "vitest";
import type { Test } from "$lib/analysis/types";
import type { PlaceBlock, ResponseDfg } from "$lib/dfg/invokers/types";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import { ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS } from "$lib/dfg/types";
import {
  activityDifferences,
  byAttribute,
  builtInVerdict,
  benjaminiHochberg,
  graphFindings,
  placeTestLine,
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
  higher: "a"
});

const block = (t: Test | null): PlaceBlock => ({ summaries: {}, test: t, method: "mannWhitney" });

const counts = { a: { cases: 1, events: 1 }, b: { cases: 1, events: 1 } };

const graph = {
  nodes: [
    { id: 2, label: "Review", counts, attributes: { Amount: block(test(0.2, 0.01)) }, values: {} },
    {
      id: 3,
      label: "Approve",
      counts,
      attributes: { Amount: block(test(0.05, 0.5, false)) },
      values: {}
    },
    { id: 4, label: "Hidden", counts, attributes: { Amount: block(test(0.9, 0.001)) }, values: {} }
  ],
  variants: [],
  transitions: [
    { source: 2, target: 3, attributes: { [TRANSITION_TIME]: block(test(0.6, 0.02)) } },
    { source: 3, target: 4, attributes: { [TRANSITION_TIME]: block(test(0.7, 0.001)) } }
  ],
  groups: [{ id: "a" }, { id: "b" }],
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
          attributes: { Amount: block(test(0.8, 0.001)) },
          values: {}
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
          },
          values: {}
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

  it("ranks significant tests first, then by effect", () => {
    expect(rank(findings).map((f) => f.place.label)).toEqual([
      "Review → Approve",
      "Review",
      "Approve"
    ]);
  });

  it("lists every place under its attribute, with how many differ", () => {
    const rows = byAttribute(findings);
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
      { key: "1", place: review, attribute: "Amount", value: null, block: block(test(0.2, 0.01)) },
      { key: "2", place: review, attribute: "Region", value: null, block: block(test(0.6, 0.01)) },
      {
        key: "3",
        place: review,
        attribute: "Cost",
        value: null,
        block: block(test(0.9, 0.5, false))
      },
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
        {
          key: "1",
          place: review,
          attribute: "Amount",
          value: null,
          block: block(test(0.2, 0.01))
        },
        {
          key: "2",
          place: review,
          attribute: "Region",
          value: null,
          block: block(test(0.6, 0.04))
        },
        {
          key: "3",
          place: review,
          attribute: "Cost",
          value: null,
          block: block(test(0.9, 0.5, false))
        },
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
  const reach = (higher: string, significant = true): PlaceBlock => ({
    summaries: {
      a: { type: "categorical", n: 100, counts: { Reached: 72, "Not reached": 28 } },
      b: { type: "categorical", n: 50, counts: { Reached: 30, "Not reached": 20 } }
    },
    test: { ...test(0.13, 0.01, significant), test: "chi2", effectSigned: null, higher },
    method: "chi2"
  });

  it("names the Group that reaches it more often, with both shares in order", () => {
    expect(
      builtInVerdict({ attribute: ACTIVITY_FREQUENCY, value: null, block: reach("a") }, groups)
    ).toBe("Day more often · 72% vs 60%");
  });

  it("keeps a decimal on a share below 10%, so a rare step keeps its ratio", () => {
    const rare: PlaceBlock = {
      ...reach("a"),
      summaries: {
        a: { type: "categorical", n: 1000, counts: { Reached: 26, "Not reached": 974 } },
        b: { type: "categorical", n: 1000, counts: { Reached: 9, "Not reached": 991 } }
      }
    };
    expect(
      builtInVerdict({ attribute: ACTIVITY_FREQUENCY, value: null, block: rare }, groups)
    ).toMatch(/^Day more often · 2[.,]6% vs 0[.,]9%$/);
  });

  it("says nothing for a frequency that is not significant or another attribute", () => {
    expect(
      builtInVerdict(
        { attribute: ACTIVITY_FREQUENCY, value: null, block: reach("a", false) },
        groups
      )
    ).toBeNull();
    expect(
      builtInVerdict({ attribute: "Amount", value: null, block: reach("a") }, groups)
    ).toBeNull();
  });
});

describe("builtInVerdict on Repetitions", () => {
  const groups = [
    { id: "a", name: "Day" },
    { id: "b", name: "Night" }
  ];

  it("names the Group that runs it more than once more often, with both shares", () => {
    const block: PlaceBlock = {
      summaries: {
        a: { type: "categorical", n: 100, counts: { "More than once": 42, Once: 58 } },
        b: { type: "categorical", n: 50, counts: { "More than once": 9, Once: 41 } }
      },
      test: { ...test(0.3, 0.001), test: "chi2", effectSigned: null },
      method: "chi2"
    };
    expect(builtInVerdict({ attribute: REPETITIONS, value: null, block: block }, groups)).toBe(
      "Day more often runs it more than once · 42% vs 18%"
    );
  });
});

describe("a categorical attribute", () => {
  const groups = [
    { id: "a", name: "Day" },
    { id: "b", name: "Night" }
  ];
  const held = (a: number, b: number, significant = true): PlaceBlock => ({
    summaries: {
      a: { type: "categorical", n: 100, counts: { Held: a, "Not held": 100 - a } },
      b: { type: "categorical", n: 100, counts: { Held: b, "Not held": 100 - b } }
    },
    test: { ...test(0.3, 0.001, significant), test: "chi2", effectSigned: null },
    method: "chi2"
  });

  it("is one finding per value, keyed apart", () => {
    const resources = {
      ...graph,
      nodes: [
        {
          ...graph.nodes[0],
          attributes: {},
          values: { Who: { Ana: held(40, 10), Bo: held(50, 50, false) } }
        }
      ]
    } as ResponseDfg;
    const found = graphFindings(resources, simplified).filter((f) => f.place.kind === "node");
    expect(found.map((f) => [f.attribute, f.value])).toEqual([
      ["Who", "Ana"],
      ["Who", "Bo"]
    ]);
    expect(new Set(found.map((f) => f.key)).size).toBe(2);
    expect(byAttribute(found)[0]).toMatchObject({ attribute: "Who", tested: 2, significant: 1 });
  });

  it("says which Group held the value more often, with both shares", () => {
    expect(builtInVerdict({ attribute: "Who", value: "Ana", block: held(40, 10) }, groups)).toBe(
      "Day more often · 40% vs 10%"
    );
  });
});

describe("edge tests", () => {
  const wait = (pValue: number) => ({ [TRANSITION_TIME]: block(test(0.5, pValue, false)) });
  const chain = {
    ...graph,
    transitions: [
      { source: 2, target: 3, attributes: wait(0.03) },
      { source: 3, target: 4, attributes: wait(0.5) }
    ]
  } as ResponseDfg;
  const drawing = (edges: [number, number][]) =>
    ({
      nodes: [2, 3, 4].map((id) => ({ id, label: `A${id}`, kind: "activity", counts })),
      edges: edges.map(([source, target]) => ({ source, target, counts }))
    }) as unknown as Simplified;
  const significant = (simplified: Simplified) =>
    graphFindings(chain, simplified)
      .filter((f) => f.place.kind === "edge" && f.block.test?.significant)
      .map((f) => f.place.label);

  it("are corrected across the edges drawn, never across hidden ones", () => {
    expect(significant(drawing([[2, 3]]))).toEqual(["A2 → A3"]);
  });

  it("are stricter as more edges are drawn", () => {
    expect(
      significant(
        drawing([
          [2, 3],
          [3, 4]
        ])
      )
    ).toEqual([]);
  });

  it("never change the block Rust sent", () => {
    graphFindings(chain, drawing([[2, 3]]));
    expect(chain.transitions[0].attributes[TRANSITION_TIME].test?.significant).toBe(false);
  });
});

describe("benjaminiHochberg", () => {
  it("is stricter than the raw threshold", () => {
    const family = [0.001, 0.04, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    expect(benjaminiHochberg(family)).toBe(0.001);
  });

  it("gives a cutoff below every p-value when nothing passes", () => {
    expect(benjaminiHochberg([0.5, 0.6, 0.7])).toBeLessThan(0);
  });
});

describe("placeTestLine", () => {
  const groups = [
    { id: "a", name: "Day" },
    { id: "b", name: "Night" }
  ];
  const line = (method: PlaceBlock["method"]) =>
    placeTestLine(
      { summaries: {}, test: { ...test(0.3, 0.02), test: "chi2", higher: null }, method },
      groups
    );

  it("names how the p-value was computed", () => {
    expect(line("fisher")).toContain("Fisher's exact test");
    expect(line("chi2")).toContain("Chi-square");
  });

  it("names a higher Group only on a significant test", () => {
    const named = { ...test(0.3, 0.02), higher: "a" };
    expect(placeTestLine({ summaries: {}, test: named, method: "mannWhitney" }, groups)).toContain(
      "Day higher"
    );
    expect(
      placeTestLine(
        { summaries: {}, test: { ...named, significant: false }, method: "mannWhitney" },
        groups
      )
    ).not.toContain("higher");
  });

  it("does not print a p too small to compute as zero", () => {
    const line = placeTestLine(
      { summaries: {}, test: { ...test(0.3, 0), test: "chi2", higher: null }, method: "chi2" },
      groups
    );
    expect(line).toContain("p < 1e-15");
  });

  it("says the p shown comes before the correction", () => {
    expect(line("chi2")).toContain("p = 0.020 before correcting across places");
  });
});

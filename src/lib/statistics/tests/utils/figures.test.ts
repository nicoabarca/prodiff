import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/custom-attributes/state/custom-attributes.svelte", () => ({
  attributeLabel: (name: string) => name
}));

import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
import { activityFigures, biggestDifferences, valueShares } from "$lib/statistics/utils/figures";

const ids = ["a", "b"];

function comparison(): ResponseGroupComparison {
  return {
    groups: [
      {
        id: "a",
        cases: 10,
        duration: null,
        durationP10: null,
        durationP90: null,
        startActivities: {},
        endActivities: {}
      },
      {
        id: "b",
        cases: 4,
        duration: null,
        durationP10: null,
        durationP90: null,
        startActivities: {},
        endActivities: {}
      }
    ],
    durationTest: null,
    activities: [
      { name: "Approve", cases: { a: 5, b: 4 }, events: { a: 5, b: 8 }, avgDurationMs: {} },
      { name: "Reject", cases: { a: 5, b: 2 }, events: { a: 5, b: 2 }, avgDurationMs: {} }
    ],
    attributes: [
      {
        name: "brand",
        scope: "case",
        summaries: {
          a: { type: "categorical", n: 10, counts: { x: 5, y: 3 } },
          b: { type: "categorical", n: 4, counts: { x: 4 } }
        },
        test: {
          test: "chi2",
          statistic: 9,
          pValue: 0.01,
          effectSize: 0.4,
          effectSigned: null,
          significant: true,
          higher: null
        }
      }
    ],
    variants: [],
    variantCensus: { total: 0, shared: 0, only: {} },
    hasActivityDuration: false
  };
}

describe("activityFigures", () => {
  it("measures the share of cases in percentage points, biggest gap first", () => {
    const figures = activityFigures(comparison(), ids, "share");
    expect(figures.map((f) => f.name)).toEqual(["Approve", "Reject"]);
    expect(figures[0].values).toEqual({ a: 50, b: 100 });
    expect(figures[0].delta).toBe(50);
  });

  it("measures events per case in percent", () => {
    const [approve] = activityFigures(comparison(), ids, "epc");
    expect(approve.values).toEqual({ a: 1, b: 2 });
    expect(approve.delta).toBe(100);
  });

  it("has no difference with one Group", () => {
    expect(activityFigures(comparison(), ["a"], "share")[0].delta).toBeNull();
  });
});

describe("valueShares", () => {
  it("folds what is left into Other", () => {
    const rows = valueShares(comparison().attributes[0].summaries, ids, 1);
    expect(rows.map((r) => r.name)).toEqual(["x", "Other (1)"]);
    expect(rows[0].values).toEqual({ a: 50, b: 100 });
    expect(rows[1].values).toEqual({ a: 50, b: 0 });
  });
});

describe("biggestDifferences", () => {
  it("ranks activity and attribute gaps together", () => {
    const found = biggestDifferences(comparison(), ids);
    expect(found[0]).toMatchObject({ pane: "activities", what: "Approve", label: "+50.0 pp" });
    expect(found.some((d) => d.what === "brand = x")).toBe(true);
  });
});

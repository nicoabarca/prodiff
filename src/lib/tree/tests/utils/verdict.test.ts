import { describe, expect, it } from "vitest";
import type { AttributeBlock, Summary, Test } from "$lib/analysis/types";
import { headline, testLine, untestable, verdict } from "$lib/tree/utils/verdict";

const groups = [
  { id: "a", name: "Approved" },
  { id: "r", name: "Rejected" }
];

function numeric(median: number, n = 100): Summary {
  return {
    type: "numerical",
    n,
    mean: median,
    std: 1,
    min: 0,
    q1: median - 1,
    median,
    q3: median + 1,
    max: median + 2,
    whiskerLow: 0,
    whiskerHigh: median + 2,
    outliersLow: 0,
    outliersHigh: 0
  };
}

function test(overrides: Partial<Test> = {}): Test {
  return {
    test: "mannwhitney",
    statistic: 1,
    pValue: 0.0001,
    effectSize: 0.34,
    effectSigned: null,
    significant: true,
    higher: "r",
    ...overrides
  };
}

describe("headline", () => {
  it("names the Group with the higher median", () => {
    expect(headline({ a: numeric(35), r: numeric(65) }, groups, false)).toBe("Rejected +30 median");
  });

  it("says so when the medians match", () => {
    expect(headline({ a: numeric(3), r: numeric(3) }, groups, false)).toBe("same median");
  });

  it("leads a category with the one that moves most", () => {
    const summaries: Record<string, Summary> = {
      a: { type: "categorical", n: 100, counts: { x: 50, y: 50 } },
      r: { type: "categorical", n: 100, counts: { x: 20, y: 80 } }
    };
    expect(headline(summaries, groups, false)).toBe("x −30.0 pp");
  });

  it("reads one Group's commonest value on its own", () => {
    const summaries: Record<string, Summary> = {
      a: { type: "categorical", n: 4, counts: { x: 1, y: 3 } }
    };
    expect(headline(summaries, groups.slice(0, 1), false)).toBe("y 75%");
  });
});

describe("verdict", () => {
  it("states direction and median gap for a significant number", () => {
    const block: AttributeBlock = { summaries: { a: numeric(10), r: numeric(12) }, test: test() };
    expect(verdict(block, groups, false)).toBe("Rejected higher by 2.00 at median");
  });

  it("reports the p-value of a failed test", () => {
    const block: AttributeBlock = {
      summaries: { a: numeric(10), r: numeric(12) },
      test: test({ significant: false, pValue: 0.41 })
    };
    expect(verdict(block, groups, false)).toBe("p = 0.410 · not significant");
  });

  it("calls a significant chi² a different mix", () => {
    const block: AttributeBlock = {
      summaries: {
        a: { type: "categorical", n: 100, counts: { x: 50, y: 50 } },
        r: { type: "categorical", n: 100, counts: { x: 20, y: 80 } }
      },
      test: test({ test: "chi2", higher: null })
    };
    expect(verdict(block, groups, false)).toBe("Different mix · x −30.0 pp");
  });
});

describe("untestable", () => {
  it("names each Group's count when one is too small", () => {
    const block: AttributeBlock = {
      summaries: { a: numeric(1, 812), r: numeric(1, 3) },
      test: null
    };
    expect(untestable(block, groups)).toBe(
      "Too few cases to test. Approved: 812, Rejected: 3 (minimum 5 each)."
    );
  });
});

describe("testLine", () => {
  it("spells out the test, its effect and the higher Group", () => {
    expect(testLine(test(), groups)).toBe(
      "Mann-Whitney U · p = 1.0e-4, corrected for the number of attributes tested · rank-biserial r 0.34 · Rejected higher"
    );
  });
});

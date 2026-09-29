import { describe, expect, it } from "vitest";
import type { Summary } from "$lib/analysis/types";
import type { TreeNode } from "$lib/tree/invokers/types";
import { shadeScale, shadeValue } from "$lib/tree/utils/flow";

const ids = ["a", "b"];

function numerical(mean: number, n: number): Summary {
  return {
    type: "numerical",
    n,
    mean,
    std: 0,
    min: mean,
    q1: mean,
    median: mean,
    q3: mean,
    max: mean,
    whiskerLow: mean,
    whiskerHigh: mean,
    outliersLow: 0,
    outliersHigh: 0
  };
}

function node(fields: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 1,
    parent: 0,
    label: "Register",
    cases: {},
    eventLevel: {},
    transitionTime: null,
    comovement: [],
    variantKey: null,
    ...fields
  };
}

describe("shadeValue", () => {
  it("sums the cases shown across the Groups", () => {
    expect(shadeValue(node(), "cases", { a: 3, b: 4 }, ids)).toBe(7);
  });

  it("counts one Group alone when the face shows that Group", () => {
    expect(shadeValue(node(), "b", { a: 3, b: 4 }, ids)).toBe(4);
    expect(shadeValue(node(), "b", { a: 3 }, ids)).toBeNull();
  });

  it("pools an attribute's mean over the Groups by their case counts", () => {
    const eventLevel = {
      Amount: { summaries: { a: numerical(10, 1), b: numerical(40, 3) }, test: null }
    };
    expect(shadeValue(node({ eventLevel }), "Amount", { a: 1, b: 3 }, ids)).toBe(32.5);
  });

  it("reads Transition Time off its own block", () => {
    const transitionTime = { summaries: { a: numerical(60, 2) }, test: null };
    expect(shadeValue(node({ transitionTime }), "Transition Time", { a: 2 }, ids)).toBe(60);
  });

  it("is missing for a categorical attribute", () => {
    const eventLevel = {
      Channel: { summaries: { a: { type: "categorical", n: 2, counts: { web: 2 } } }, test: null }
    } satisfies TreeNode["eventLevel"];
    expect(shadeValue(node({ eventLevel }), "Channel", { a: 2 }, ids)).toBeNull();
  });

  it("is missing for the Start root and where no case is shown", () => {
    expect(shadeValue(node({ parent: null }), "cases", { a: 3 }, ids)).toBeNull();
    expect(shadeValue(node(), "cases", {}, ids)).toBeNull();
  });
});

describe("shadeScale", () => {
  it("spreads counts and durations on a log scale", () => {
    expect(shadeScale("cases", ids)).toBe("log");
    expect(shadeScale("a", ids)).toBe("log");
    expect(shadeScale("Transition Time", ids)).toBe("log");
  });

  it("spreads any other attribute linearly", () => {
    expect(shadeScale("Amount", ids)).toBe("linear");
  });
});

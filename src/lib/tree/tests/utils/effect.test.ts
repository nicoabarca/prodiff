import { describe, expect, it } from "vitest";
import type { AttributeBlock, Test } from "$lib/analysis/types";
import type { TreeNode } from "$lib/tree/invokers/types";
import { edgeEffect, hasSignificant, peakEffect, rankedBlocks } from "$lib/tree/utils/effect";

function test(significant: boolean, effectSize: number): Test {
  return {
    test: "mannwhitney",
    statistic: 0,
    pValue: significant ? 0.001 : 0.5,
    effectSize,
    effectSigned: null,
    significant,
    higher: null
  };
}

function block(significant: boolean, effectSize: number): AttributeBlock {
  return { summaries: {}, test: test(significant, effectSize) };
}

function node(fields: Partial<TreeNode> = {}): TreeNode {
  return {
    id: 1,
    parent: 0,
    label: "Register",
    cases: {},
    eventLevel: {},
    transitionTime: null,
    variantKey: null,
    ...fields
  };
}

describe("a node's significance", () => {
  const waiting = node({
    eventLevel: { amount: block(true, 0.2), region: block(false, 0.05) },
    transitionTime: block(true, 0.6)
  });

  it("counts only the node's own attributes", () => {
    expect(hasSignificant(node({ transitionTime: block(true, 0.6) }))).toBe(false);
    expect(hasSignificant(waiting)).toBe(true);
  });

  it("colours the badge by the node's own strongest effect", () => {
    expect(peakEffect(waiting)).toBe(0.2);
  });

  it("leaves Transition Time out of the panel's ranking", () => {
    const ranked = rankedBlocks(waiting);
    const names = [...ranked.finding, ...ranked.weak, ...ranked.untested].map(([name]) => name);
    expect(names).toEqual(["amount", "region"]);
  });
});

describe("edgeEffect", () => {
  it("is the effect of a significant Transition Time test", () => {
    expect(edgeEffect(node({ transitionTime: block(true, 0.4) }))).toBe(0.4);
  });

  it("is null for a test that did not pass, or no Transition Time", () => {
    expect(edgeEffect(node({ transitionTime: block(false, 0.4) }))).toBeNull();
    expect(edgeEffect(node({ transitionTime: { summaries: {}, test: null } }))).toBeNull();
    expect(edgeEffect(node())).toBeNull();
  });
});

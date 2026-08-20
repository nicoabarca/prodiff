/**
 * The grid's ranking fails silently — a mis-sorted grid looks exactly like a
 * sorted one, and the whole point of the view is that the biggest difference is
 * on the first screen.
 */
import { describe, expect, test } from "vitest";
import type { DurationShape } from "$lib/distributions/invokers/types";
import { curveRows, gridAttributes, logBars, outlierNote, shareAt } from "$lib/distributions/utils/distributions";
import type { AttributeBlock, DirectedTree, Test, TreeNode } from "$lib/tree/invokers/types";
import { TRANSITION_TIME } from "$lib/tree/utils/settings";
import { stepContext } from "$lib/tree/utils/tree";

/** Named `testResult` rather than `test`, which is Vitest's. */
function testResult(effectSize: number, significant = true): Test {
  return {
    test: "chi2",
    statistic: 1,
    pValue: significant ? 0.001 : 0.9,
    effectSize,
    effectSigned: null,
    significant,
    direction: null
  };
}

function block(t: Test | null): AttributeBlock {
  return { groupA: null, groupB: null, test: t } as unknown as AttributeBlock;
}

/** A node with the given attribute blocks and no Transition Time. */
function node(eventLevel: Record<string, AttributeBlock>): TreeNode {
  return { eventLevel, transitionTime: null } as unknown as TreeNode;
}

const names = (cards: ReturnType<typeof gridAttributes>) => cards.map((card) => card.name);

describe("gridAttributes", () => {
  test("tested attributes lead, strongest first", () => {
    // The finding is on the first screen.
    const cards = gridAttributes(
      node({
        Operator: block(testResult(0.12)),
        Resource: block(testResult(0.61)),
        Equipment: block(testResult(0.4))
      }),
      [],
      [],
      "difference"
    );
    expect(names(cards)).toEqual(["Resource", "Equipment", "Operator"]);
  });

  test("an untested block sorts below every tested one, whatever the sort", () => {
    // So the "untested" divider is one cut down the list rather than a scatter.
    const n = node({
      Zeta: block(testResult(0.61)),
      Alpha: block(null),
      Middle: block(testResult(0.2))
    });
    expect(names(gridAttributes(n, [], [], "difference"))).toEqual(["Zeta", "Middle", "Alpha"]);
    expect(names(gridAttributes(n, [], [], "name"))).toEqual(["Middle", "Zeta", "Alpha"]);
  });

  test("a failed test still carries a magnitude, and still ranks by it", () => {
    // The chip says "no difference", the position says how much evidence there
    // was to weigh.
    const cards = gridAttributes(
      node({ Weak: block(testResult(0.5, false)), Strong: block(testResult(0.7)) }),
      [],
      [],
      "difference"
    );
    expect(names(cards)).toEqual(["Strong", "Weak"]);
  });

  test("Transition Time is a block like any other, ranked on its own effect size", () => {
    const n = {
      eventLevel: { Resource: block(testResult(0.2)) },
      transitionTime: block(testResult(0.8))
    } as unknown as TreeNode;
    expect(names(gridAttributes(n, [], [], "difference"))).toEqual([TRANSITION_TIME, "Resource"]);
  });

  test("a hand-added attribute joins the untested tail, and is never duplicated", () => {
    const n = node({ Resource: block(testResult(0.5)) });
    expect(names(gridAttributes(n, ["Cost"], [], "difference"))).toEqual(["Resource", "Cost"]);
    expect(gridAttributes(n, ["Cost"], [], "difference")[1].inBuild).toBe(false);
    expect(names(gridAttributes(n, ["Resource"], [], "difference"))).toEqual(["Resource"]);
  });

  test("extras follow the user to a node that tested nothing in common", () => {
    // Walking the path is why they were added.
    const other = node({ Shift: block(testResult(0.3)) });
    expect(names(gridAttributes(other, ["Cost"], [], "difference"))).toEqual(["Shift", "Cost"]);
  });

  test("dismissing hides a card at this node only", () => {
    // The caller clears the list on a node change, and the tested attribute
    // comes back with the new node.
    const n = node({ Resource: block(testResult(0.5)), Operator: block(testResult(0.4)) });
    expect(names(gridAttributes(n, [], ["Resource"], "difference"))).toEqual(["Operator"]);
    expect(names(gridAttributes(n, [], [], "difference"))).toEqual(["Resource", "Operator"]);
  });

  test("ties break by name rather than by object key order", () => {
    // So the grid does not reshuffle under the user when two attributes measure
    // the same.
    const cards = gridAttributes(
      node({ Zeta: block(testResult(0.5)), Alpha: block(testResult(0.5)) }),
      [],
      [],
      "difference"
    );
    expect(names(cards)).toEqual(["Alpha", "Zeta"]);
  });
});

/**
 * The step picker beside the grid draws `stepContext` rather than the tree, so
 * a bug here shows the numbers next to activities they never counted.
 *
 *   0 ─ 1 ─┬─ 2 ─ 4 ─ 5
 *          └─ 3
 */
describe("stepContext", () => {
  const shaped: DirectedTree = {
    nodes: [
      { id: 0, parent: null },
      { id: 1, parent: 0 },
      { id: 2, parent: 1 },
      { id: 3, parent: 1 },
      { id: 4, parent: 2 },
      { id: 5, parent: 4 }
    ]
  } as unknown as DirectedTree;

  const context = (id: number, depth?: number) =>
    [...stepContext(shaped, id, depth)].sort((a, b) => a - b);

  test("the trace down to the step plus one level past it", () => {
    // 5 is two below, so out.
    expect(context(2)).toEqual([0, 1, 2, 4]);
  });

  test("a leaf is its trace and nothing more", () => {
    expect(context(5)).toEqual([0, 1, 2, 4, 5]);
  });

  test("never a sibling branch", () => {
    // 3 hangs off 1, which is on the trace, and stays out.
    expect(context(2)).toEqual([0, 1, 2, 4]);
  });

  test("the root's own children follow it, and only they", () => {
    expect(context(0)).toEqual([0, 1]);
  });

  test("the step itself is always in, even with nothing below", () => {
    expect(context(3)).toEqual([0, 1, 3]);
  });

  test("the depth is where the walk stops, not a special case", () => {
    // Widening it needs no other change, and Infinity is the whole subtree.
    expect(context(2, 2)).toEqual([0, 1, 2, 4, 5]);
    expect(context(0, Infinity)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(context(2, 0)).toEqual([0, 1, 2]);
  });
});

test("the ladder's index is its percentile", () => {
  // An off-by-one here reads every duration against the wrong share — and still
  // looks like a plausible curve.
  const ladder = [0, 10, 20, 30, 40];
  expect(shareAt(ladder, 0)).toBe(0);
  expect(shareAt(ladder, 20)).toBe(0.5);
  expect(shareAt(ladder, 40)).toBe(1);
  // Between two rungs the share is the lower one's: the ECDF is a step
  // function, and nothing has finished until the next rung is reached.
  expect(shareAt(ladder, 25)).toBe(0.5);
  // Past the top everything has finished; below the bottom, nothing has.
  expect(shareAt(ladder, 999)).toBe(1);
  expect(shareAt(ladder, -1)).toBe(0);
  // A Group with no values has no share rather than a share of zero.
  expect(shareAt([], 5)).toBe(null);
  expect(shareAt([7], 7)).toBe(null);
});

test("both curves land on one sorted x", () => {
  // What lets a single hover answer for both Groups, and what `bisect-x` needs
  // to search.
  const rows = curveRows([0, 10, 20], [10, 20, 30]);
  expect(
    rows.map((row) => row.value),
    "the union of both ladders, sorted, without duplicates"
  ).toEqual([0, 10, 20, 30]);
  expect(rows.at(-1)).toEqual({ value: 30, a: 1, b: 1 });
  // At 0 the second Group has not started: its own ladder begins at 10.
  expect(rows[0]).toEqual({ value: 0, a: 0, b: 0 });
  // One-Group mode: the absent Group is null throughout, never zero, so the
  // tooltip says "—" instead of claiming nothing finished.
  expect(curveRows([0, 10], [])).toEqual([
    { value: 0, a: 0, b: null },
    { value: 10, a: 1, b: null }
  ]);
});

test("log bars are labelled by their own edges", () => {
  // Unequal widths are the point, so the range has to be on the axis rather
  // than an index.
  const shape = {
    ecdfA: [],
    ecdfB: [],
    boxA: null,
    boxB: null,
    logEdges: [0, 1_000, 60_000, 3_600_000],
    logCountsA: [7, 3, 1],
    logCountsB: [2, 8, 0]
  } satisfies DurationShape;
  expect(logBars(shape)).toEqual([
    { label: "0s–1s", a: 7, b: 2 },
    { label: "1s–1m 0s", a: 3, b: 8 },
    { label: "1m 0s–1h 0m", a: 1, b: 0 }
  ]);
});

test("the outlier note names the cutoff", () => {
  // The count alone is meaningless without it.
  const secs = (value: number) => `${value}s`;
  const stats = { whiskerLow: 26, whiskerHigh: 253, outliersLow: 34, outliersHigh: 129 };
  expect(outlierNote("Night", stats, secs)).toBe("Night: 129 over 253s, 34 under 26s, not plotted");
  // Only the side that has any: a bare "0 over 253s" reads as a finding.
  expect(outlierNote("Night", { ...stats, outliersHigh: 0 }, secs)).toBe(
    "Night: 34 under 26s, not plotted"
  );
  expect(outlierNote("Night", { ...stats, outliersLow: 0 }, secs)).toBe(
    "Night: 129 over 253s, not plotted"
  );
  // Nothing past either line means nothing to say, not an empty sentence.
  expect(outlierNote("Night", { ...stats, outliersLow: 0, outliersHigh: 0 }, secs)).toBe(null);
});

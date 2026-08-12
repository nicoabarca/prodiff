/**
 * The grid's ranking fails silently — a mis-sorted grid looks exactly like a
 * sorted one, and the whole point of the view is that the biggest difference is
 * on the first screen. Run with `npx tsx src/lib/distributions.test.ts`.
 */
import assert from "node:assert/strict";
import { curve, gridAttributes, logBars, type DurationShape } from "./distributions";
import {
  stepContext,
  TRANSITION_TIME,
  type AttributeBlock,
  type DirectedTree,
  type Test,
  type TreeNode
} from "./tree";

function test(effectSize: number, significant = true): Test {
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

// Tested attributes lead, strongest first — the finding is on the first screen.
{
  const cards = gridAttributes(
    node({
      Operator: block(test(0.12)),
      Resource: block(test(0.61)),
      Equipment: block(test(0.4))
    }),
    [],
    [],
    "difference"
  );
  assert.deepEqual(names(cards), ["Resource", "Equipment", "Operator"]);
}

// A block whose test never ran sorts below every tested one, whatever the sort,
// so the "untested" divider is one cut down the list rather than a scatter.
{
  const n = node({
    Zeta: block(test(0.61)),
    Alpha: block(null),
    Middle: block(test(0.2))
  });
  assert.deepEqual(names(gridAttributes(n, [], [], "difference")), ["Zeta", "Middle", "Alpha"]);
  assert.deepEqual(names(gridAttributes(n, [], [], "name")), ["Middle", "Zeta", "Alpha"]);
}

// A test that failed still carries a magnitude, and still ranks by it: the chip
// says "no difference", the position says how much evidence there was to weigh.
{
  const cards = gridAttributes(
    node({ Weak: block(test(0.5, false)), Strong: block(test(0.7)) }),
    [],
    [],
    "difference"
  );
  assert.deepEqual(names(cards), ["Strong", "Weak"]);
}

// Transition Time is a block like any other, ranked on its own effect size.
{
  const n = {
    eventLevel: { Resource: block(test(0.2)) },
    transitionTime: block(test(0.8))
  } as unknown as TreeNode;
  assert.deepEqual(names(gridAttributes(n, [], [], "difference")), [TRANSITION_TIME, "Resource"]);
}

// A hand-added attribute the build never tested joins the untested tail, and is
// never duplicated when the build happens to have tested it after all.
{
  const n = node({ Resource: block(test(0.5)) });
  assert.deepEqual(names(gridAttributes(n, ["Cost"], [], "difference")), ["Resource", "Cost"]);
  assert.equal(gridAttributes(n, ["Cost"], [], "difference")[1].inBuild, false);
  assert.deepEqual(names(gridAttributes(n, ["Resource"], [], "difference")), ["Resource"]);
}

// Extras follow the user to a node that tested nothing in common — walking the
// path is why they were added.
{
  const other = node({ Shift: block(test(0.3)) });
  assert.deepEqual(names(gridAttributes(other, ["Cost"], [], "difference")), ["Shift", "Cost"]);
}

// Dismissing hides a card at this node only; the caller clears the list on a
// node change, and the tested attribute comes back with the new node.
{
  const n = node({ Resource: block(test(0.5)), Operator: block(test(0.4)) });
  assert.deepEqual(names(gridAttributes(n, [], ["Resource"], "difference")), ["Operator"]);
  assert.deepEqual(names(gridAttributes(n, [], [], "difference")), ["Resource", "Operator"]);
}

// Ties break by name rather than by object key order, so the grid does not
// reshuffle under the user when two attributes measure the same.
{
  const cards = gridAttributes(
    node({ Zeta: block(test(0.5)), Alpha: block(test(0.5)) }),
    [],
    [],
    "difference"
  );
  assert.deepEqual(names(cards), ["Alpha", "Zeta"]);
}

/**
 * The step picker beside the grid draws `stepContext` rather than the tree, so
 * a bug here shows the numbers next to activities they never counted.
 *
 *   0 ─ 1 ─┬─ 2 ─ 4 ─ 5
 *          └─ 3
 */
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

// The trace down to the step plus one level past it — 5 is two below, so out.
assert.deepEqual(context(2), [0, 1, 2, 4]);
// A leaf is its trace and nothing more.
assert.deepEqual(context(5), [0, 1, 2, 4, 5]);
// Never a sibling branch: 3 hangs off 1, which is on the trace, and stays out.
assert.deepEqual(context(2), [0, 1, 2, 4]);
// The root's own children follow it, and only they.
assert.deepEqual(context(0), [0, 1]);
// The step itself is always in, even standing on a branch with nothing below.
assert.deepEqual(context(3), [0, 1, 3]);

// The depth is where the walk stops, not a special case — widening it needs no
// other change, and Infinity is the whole subtree.
assert.deepEqual(context(2, 2), [0, 1, 2, 4, 5]);
assert.deepEqual(context(0, Infinity), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(context(2, 0), [0, 1, 2]);

// The curve reads the ladder's index as its percentile, so an off-by-one here
// would plot every duration against the wrong share and still look plausible.
{
  const ladder = [0, 10, 20, 30, 40];
  assert.deepEqual(curve(ladder), [
    { value: 0, share: 0 },
    { value: 10, share: 0.25 },
    { value: 20, share: 0.5 },
    { value: 30, share: 0.75 },
    { value: 40, share: 1 }
  ]);
  // A Group with no values has no curve rather than a point at the origin.
  assert.deepEqual(curve([]), []);
  assert.deepEqual(curve([5]), []);
}

// Log bars are labelled by their own edges — unequal widths are the point, so
// the range has to be on the axis rather than an index.
{
  const shape = {
    ecdfA: [],
    ecdfB: [],
    boxA: null,
    boxB: null,
    logEdges: [0, 1_000, 60_000, 3_600_000],
    logCountsA: [7, 3, 1],
    logCountsB: [2, 8, 0]
  } satisfies DurationShape;
  assert.deepEqual(logBars(shape), [
    { label: "0s–1s", a: 7, b: 2 },
    { label: "1s–1m 0s", a: 3, b: 8 },
    { label: "1m 0s–1h 0m", a: 1, b: 0 }
  ]);
}

console.log("distributions: ok");

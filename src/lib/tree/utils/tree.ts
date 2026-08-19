import type { DirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type { TreeView, Visible } from "$lib/tree/types";
import { hasSignificant } from "$lib/tree/utils/effect";

export function nodeCases(node: TreeNode): number {
  return node.groupACases + node.groupBCases;
}

export function isDivergent(node: TreeNode): boolean {
  return node.comovement.some((pair) => pair.relationship === "divergent");
}

/** Which Groups reach a node — the tree's primary colour channel. */
export function membership(node: TreeNode): "a" | "b" | "shared" {
  if (node.groupBCases === 0) return "a";
  if (node.groupACases === 0) return "b";
  return "shared";
}

export function children(tree: DirectedTree): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const node of tree.nodes) {
    if (node.parent === null) continue;
    const siblings = map.get(node.parent);
    if (siblings) siblings.push(node.id);
    else map.set(node.parent, [node.id]);
  }
  return map;
}

/** The path from the root down to `id`, inclusive — a node's full trace. */
export function pathTo(tree: DirectedTree, id: number): TreeNode[] {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const path: TreeNode[] = [];
  let current: TreeNode | undefined = byId.get(id);
  while (current) {
    path.unshift(current);
    current = current.parent === null ? undefined : byId.get(current.parent);
  }
  return path;
}

/**
 * How far past the step its context reaches. One level answers "and then what?"
 * without the rail turning back into the tree the view exists to get away from.
 * Any depth works, `Infinity` included — the walk stops where this says, so
 * widening it is this number and nothing else.
 */
export const CONTEXT_DEPTH = 1;

/**
 * The nodes one step is read in the context of: its own trace down from the
 * root, and what the cases reaching it go on to do next.
 *
 * Siblings on other traces are left out on purpose. They are other cases'
 * steps, and nothing the Distributions grid says describes them — showing them
 * would put the numbers next to activities they never counted.
 */
export function stepContext(
  tree: DirectedTree,
  id: number,
  depth: number = CONTEXT_DEPTH
): Set<number> {
  const context = new Set(pathTo(tree, id).map((node) => node.id));
  const kids = children(tree);
  let frontier = kids.get(id) ?? [];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: number[] = [];
    for (const child of frontier) {
      context.add(child);
      next.push(...(kids.get(child) ?? []));
    }
    frontier = next;
  }
  return context;
}

/** One leaf per Variant: every path from the root ends at exactly one. */
export function leaves(tree: DirectedTree): TreeNode[] {
  const kids = children(tree);
  return tree.nodes.filter((n) => !kids.has(n.id));
}

/** Cases in both Groups before any cut — the denominator for every share. */
export function totalCases(tree: DirectedTree): number {
  return Number(tree.groupA.caseCount) + Number(tree.groupB?.caseCount ?? 0);
}

/**
 * Which nodes render. Pruning works on whole Variants — a path from root to
 * leaf — rather than on nodes, so a surviving path is always a trace some case
 * actually followed. Collapsing is applied afterwards: it hides a subtree
 * without claiming those Variants don't exist.
 *
 * `selected` is the picker's set. Unchecking a Variant prunes it here at once,
 * but the aggregates on the nodes above it still describe it until the next
 * build — which is why doing so marks the tree stale.
 */
export function visibleNodes(
  tree: DirectedTree,
  view: TreeView,
  selected: Set<string>
): Visible {
  const kids = children(tree);
  const all = leaves(tree);

  // An empty selection means nothing has been chosen yet, so the built tree
  // already is the selection — filtering on it would blank the canvas.
  const chosen = (leaf: TreeNode) =>
    selected.size === 0 || (leaf.variantKey !== null && selected.has(leaf.variantKey));

  // Biggest Variants first. Case count then id keeps ties stable across renders.
  const ranked = all
    .filter(chosen)
    .filter((leaf) => !view.significantOnly || pathTo(tree, leaf.id).some(hasSignificant))
    .sort((a, b) => nodeCases(b) - nodeCases(a) || a.id - b.id);

  const kept = new Set<number>();
  const cases = new Map<number, { groupACases: number; groupBCases: number }>();
  let casesShown = 0;
  for (const leaf of ranked) {
    casesShown += nodeCases(leaf);
    for (const node of pathTo(tree, leaf.id)) {
      kept.add(node.id);
      const acc = cases.get(node.id) ?? { groupACases: 0, groupBCases: 0 };
      acc.groupACases += leaf.groupACases;
      acc.groupBCases += leaf.groupBCases;
      cases.set(node.id, acc);
    }
  }
  const variantsShown = ranked.length;

  // A collapsed node stays; everything under it goes, and the count of what
  // went is what the badge shows.
  const hiddenBelow = new Map<number, number>();
  const ids = new Set(kept);
  for (const id of view.collapsed) {
    if (!kept.has(id)) continue;
    let hidden = 0;
    const stack = [...(kids.get(id) ?? [])];
    while (stack.length) {
      const next = stack.pop() as number;
      if (!kept.has(next)) continue;
      ids.delete(next);
      hidden += 1;
      stack.push(...(kids.get(next) ?? []));
    }
    if (hidden > 0) hiddenBelow.set(id, hidden);
  }
  // Nested collapses can strip a node that also carries a badge; drop those.
  for (const id of [...hiddenBelow.keys()]) if (!ids.has(id)) hiddenBelow.delete(id);

  return {
    ids,
    hiddenBelow,
    variantsShown,
    variantsHidden: all.length - variantsShown,
    casesShown,
    cases
  };
}

/**
 * Distance from the synthetic Start root — 0 at the root, 1 at the first
 * activity. This is the event index a node's own step sits at, offset by the
 * root: the node at depth `d` is the `d`th activity of every case reaching it.
 */
export function nodeDepth(tree: DirectedTree, id: number): number {
  return pathTo(tree, id).length - 1;
}

/**
 * The Variant keys of every leaf under `id` that survived pruning — how a node
 * is named to the backend when asking for its Distributions.
 *
 * Keyed off `visible.cases` rather than `visible.ids`: `cases` holds every node
 * on a surviving path, while `ids` has collapsed subtrees stripped out. Folding
 * a subtree away is a rendering choice and must not change which cases the
 * charts describe.
 */
export function subtreeVariants(tree: DirectedTree, visible: Visible, id: number): string[] {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const kids = children(tree);
  const keys: string[] = [];
  const stack = [id];
  while (stack.length) {
    const next = stack.pop() as number;
    if (!visible.cases.has(next)) continue;
    const key = byId.get(next)?.variantKey;
    if (key !== null && key !== undefined) keys.push(key);
    stack.push(...(kids.get(next) ?? []));
  }
  return keys;
}

/**
 * The nodes one Variant runs through, restricted to what is on screen. Empty
 * when that Variant isn't in this tree — unselected, pruned, or built before
 * it existed — so hovering it highlights nothing rather than lying about a
 * partial path.
 */
export function variantPath(tree: DirectedTree, visible: Visible, key: string): Set<number> {
  const leaf = tree.nodes.find((node) => node.variantKey === key);
  if (!leaf || !visible.ids.has(leaf.id)) return new Set();
  return new Set(pathTo(tree, leaf.id).map((node) => node.id));
}

import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type { TreeView, Visible } from "$lib/tree/types";
import { hasSignificant } from "$lib/tree/utils/effect";

/** Cases reaching a node, summed over every Group on the tree. */
export function nodeCases(node: TreeNode): number {
  return Object.values(node.cases).reduce((sum, cases) => sum + cases, 0);
}

/** Cases one Group brings to a node. Absent means none reached it. */
export function groupCasesAt(node: TreeNode, groupId: string): number {
  return node.cases[groupId] ?? 0;
}

export function isDivergent(node: TreeNode): boolean {
  return node.comovement.some((pair) => pair.relationship === "divergent");
}

/** The only Group that reaches a node, or `"shared"` when more than one does. */
export function membership(node: TreeNode, groupIds: string[]): string {
  const reaching = groupIds.filter((id) => groupCasesAt(node, id) > 0);
  return reaching.length === 1 ? reaching[0] : "shared";
}

export function children(tree: ResponseDirectedTree): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const node of tree.nodes) {
    if (node.parent === null) continue;
    const siblings = map.get(node.parent);
    if (siblings) siblings.push(node.id);
    else map.set(node.parent, [node.id]);
  }
  return map;
}

/** The path from the root down to `id`, inclusive. */
export function pathTo(tree: ResponseDirectedTree, id: number): TreeNode[] {
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
 * How far past the step its context reaches. Any depth works, `Infinity` included.
 */
export const CONTEXT_DEPTH = 1;

/**
 * The nodes one step is read in the context of: its own trace down from the
 * root, and what the cases reaching it go on to do next. Siblings on other
 * traces are left out.
 */
export function stepContext(
  tree: ResponseDirectedTree,
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
export function leaves(tree: ResponseDirectedTree): TreeNode[] {
  const kids = children(tree);
  return tree.nodes.filter((n) => !kids.has(n.id));
}

/** Cases in every Group before any cut: the denominator for every share. */
export function totalCases(tree: ResponseDirectedTree): number {
  return tree.groups.reduce((sum, group) => sum + Number(group.caseCount), 0);
}

/** The Groups on a tree, in payload order. */
export function groupIds(tree: ResponseDirectedTree): string[] {
  return tree.groups.map((group) => group.id);
}

/**
 * Which nodes render. Pruning works on whole Variants, so a surviving path is
 * always a trace some case followed; collapsing is applied afterwards.
 * Unchecking a Variant prunes it at once, but the aggregates above it still
 * describe it until the next build, which is why that marks the tree stale.
 */
export function visibleNodes(
  tree: ResponseDirectedTree,
  view: TreeView,
  selected: Set<string>
): Visible {
  const kids = children(tree);
  const all = leaves(tree);

  // An empty selection means nothing has been chosen yet, so the built tree
  // already is the selection.
  const chosen = (leaf: TreeNode) =>
    selected.size === 0 || (leaf.variantKey !== null && selected.has(leaf.variantKey));

  // Biggest Variants first. Case count then id keeps ties stable across renders.
  const ranked = all
    .filter(chosen)
    .filter((leaf) => !view.significantOnly || pathTo(tree, leaf.id).some(hasSignificant))
    .sort((a, b) => nodeCases(b) - nodeCases(a) || a.id - b.id);

  const kept = new Set<number>();
  const cases = new Map<number, Record<string, number>>();
  const groups = groupIds(tree);
  let casesShown = 0;
  for (const leaf of ranked) {
    casesShown += nodeCases(leaf);
    for (const node of pathTo(tree, leaf.id)) {
      kept.add(node.id);
      const acc = cases.get(node.id) ?? Object.fromEntries(groups.map((id) => [id, 0]));
      for (const id of groups) acc[id] += groupCasesAt(leaf, id);
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
 * Distance from the synthetic Start root: 0 at the root, 1 at the first
 * activity. The node at depth `d` is the `d`th activity of every case there.
 */
export function nodeDepth(tree: ResponseDirectedTree, id: number): number {
  return pathTo(tree, id).length - 1;
}

/**
 * The Variant keys of every leaf under `id` that survived pruning: how a node
 * is named to the backend when asking for its Distributions. Keyed off
 * `visible.cases`, not `visible.ids`, so collapsing a subtree never changes
 * which cases the charts describe.
 */
export function subtreeVariants(
  tree: ResponseDirectedTree,
  visible: Visible,
  id: number
): string[] {
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
 * when that Variant isn't in this tree: unselected, pruned, or too new.
 */
export function variantPath(
  tree: ResponseDirectedTree,
  visible: Visible,
  key: string
): Set<number> {
  const leaf = tree.nodes.find((node) => node.variantKey === key);
  if (!leaf || !visible.ids.has(leaf.id)) return new Set();
  return new Set(pathTo(tree, leaf.id).map((node) => node.id));
}

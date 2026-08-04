/**
 * The Distributions drawer's state. In-memory module `$state` like `view` in
 * `tree.svelte.ts` rather than a persisted table like `settings`: a chart set
 * is two or three picks, cheap to redo, and nothing here is a build input.
 *
 * The chart set is a *lens*, not a property of a node — selecting another node
 * keeps the attributes and the Scope and refetches them for the new node, which
 * is how walking down a path shows the same histograms shifting.
 */

import { nodeDistributions, type NodeDistributions, type Scope } from "$lib/distributions";
import { built, groupChains, isStale, selected } from "$lib/state/tree.svelte";
import { nodeDepth, subtreeVariants, visibleNodes } from "$lib/tree";
import { selectedVariants, view } from "$lib/state/tree.svelte";
import type { Project } from "$lib/types";

/** Drawer chrome. `height` is in `rem`, dragged by the handle on the top edge. */
// Tall enough that a top-twelve categorical card shows most of its bars before
// the card has to scroll: twelve rows plus the axis is about 21rem, and the
// drawer's own header takes the rest.
export const drawer = $state<{ open: boolean; height: number }>({
  open: false,
  height: 26
});

export const MIN_HEIGHT = 11;
export const MAX_HEIGHT = 40;

/**
 * What is charted. `attributes` is deduplicated by construction — the add menu
 * only offers attributes not already open — so an attribute name is a stable
 * card key, and `expanded` can be a plain list of them.
 */
export const charts = $state<{
  attributes: string[];
  scope: Scope;
  /** Cards showing every category rather than the top twelve. */
  expanded: string[];
}>({ attributes: [], scope: "atStep", expanded: [] });

/**
 * The numbers for the current node, in one keyed slot — the same shape `built`
 * uses. Switching nodes replaces it rather than accumulating a per-node cache:
 * the payload is small but the node it describes is always the selected one.
 */
export const loaded = $state<{
  key: string | null;
  data: NodeDistributions | null;
  loading: boolean;
  error: string | null;
}>({ key: null, data: null, loading: false, error: null });

export function toggleExpanded(attribute: string) {
  const at = charts.expanded.indexOf(attribute);
  if (at === -1) charts.expanded.push(attribute);
  else charts.expanded.splice(at, 1);
}

export function addChart(attribute: string) {
  if (!charts.attributes.includes(attribute)) charts.attributes.push(attribute);
}

export function removeChart(attribute: string) {
  charts.attributes = charts.attributes.filter((name) => name !== attribute);
  charts.expanded = charts.expanded.filter((name) => name !== attribute);
}

/**
 * What identifies the numbers on screen. Keyed on the Variant list rather than
 * on the node id alone: that list is what the backend is actually asked about,
 * so view-level pruning — the Variant picker, `significantOnly` — invalidates
 * the slot without this having to enumerate the ways it can change.
 */
function key(
  nodeId: number,
  depth: number,
  variants: string[],
  attributes: string[],
  scope: Scope
): string {
  return JSON.stringify([built.key, nodeId, depth, variants, attributes, scope]);
}

/**
 * Fetches the selected node's Distributions unless they are already in hand.
 *
 * Refuses while the tree is stale. The node is named to the backend by the
 * Variant keys of its subtree's leaves, which come from the tree on screen —
 * querying those under chains the tree was not built with would describe a case
 * set matching neither the drawing nor the filters. The drawer says so and
 * offers a rebuild instead.
 */
export async function loadDistributions(project: Project) {
  const tree = built.tree;
  const nodeId = selected.id;
  if (!tree || nodeId === null || isStale() || charts.attributes.length === 0) return;

  const depth = nodeDepth(tree, nodeId);
  // The Start root has no event of its own, so `atStep` has nothing to count.
  if (charts.scope === "atStep" && depth === 0) return;

  const chains = groupChains();
  if (!chains) return;

  const attributes = [...charts.attributes];
  const visible = visibleNodes(tree, view, selectedVariants());
  const variants = subtreeVariants(tree, visible, nodeId);
  const next = key(nodeId, depth, variants, attributes, charts.scope);
  if (loaded.loading || loaded.key === next) return;

  loaded.loading = true;
  loaded.error = null;
  try {
    const data = await nodeDistributions(
      project,
      chains.a,
      chains.b,
      attributes,
      variants,
      depth,
      charts.scope
    );
    loaded.data = data;
    loaded.key = next;
  } catch (cause) {
    loaded.error = String(cause);
    loaded.data = null;
    loaded.key = null;
  } finally {
    loaded.loading = false;
  }
}

/** Drops numbers belonging to another node, tree or project. */
export function forgetDistributions() {
  loaded.key = null;
  loaded.data = null;
  loaded.error = null;
}

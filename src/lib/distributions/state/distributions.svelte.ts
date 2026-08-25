/**
 * The Distributions view's state, in memory only — nothing here is a build
 * input. The lens is not a property of a node: selecting another keeps the
 * Scope, the sort and the hand-added attributes, and refetches.
 */

import { nodeDistributions } from "$lib/distributions/invokers/node-distributions";
import type { ResponseNodeDistributions } from "$lib/distributions/invokers/types";
import type { Encoding, Scope, Sort } from "$lib/distributions/types";
import { built, comparedIds, isStale, selected } from "$lib/tree/state/tree.svelte";
import { nodeDepth, subtreeVariants, visibleNodes } from "$lib/tree/utils/tree";
import { selectedVariants, view } from "$lib/tree/state/tree.svelte";
import type { Project } from "$lib/event-log/types";

/**
 * What is charted, beyond the node's own tested attributes. `extra` outlives a
 * node change; `dismissed` does not, since a tested attribute is part of what
 * the next node has to say.
 */
export const charts = $state<{
  scope: Scope;
  sort: Sort;
  /**
   * How duration cards draw — one setting for all of them, so the two duration
   * attributes stay comparable. Opens on the curve.
   */
  encoding: Encoding;
  /** Attributes the build never tested, added by hand. */
  extra: string[];
  /** Cards hidden at the current node only. */
  dismissed: string[];
  /** Cards showing every category rather than the top twelve. */
  expanded: string[];
}>({
  scope: "atStep",
  sort: "difference",
  encoding: "ecdf",
  extra: [],
  dismissed: [],
  expanded: []
});

/**
 * The numbers for the current node, in one keyed slot. Switching nodes replaces
 * it rather than accumulating a per-node cache.
 */
export const loaded = $state<{
  key: string | null;
  data: ResponseNodeDistributions | null;
  loading: boolean;
  error: string | null;
}>({ key: null, data: null, loading: false, error: null });

export function toggleExpanded(attribute: string) {
  const at = charts.expanded.indexOf(attribute);
  if (at === -1) charts.expanded.push(attribute);
  else charts.expanded.splice(at, 1);
}

/** Opens a card for an attribute the build never tested. */
export function addExtra(attribute: string) {
  charts.dismissed = charts.dismissed.filter((name) => name !== attribute);
  if (!charts.extra.includes(attribute)) charts.extra.push(attribute);
}

/**
 * Closes a card. A hand-added attribute goes away for good; a tested one is
 * only hidden here and comes back at the next node.
 */
export function dismiss(attribute: string) {
  charts.expanded = charts.expanded.filter((name) => name !== attribute);
  if (charts.extra.includes(attribute)) {
    charts.extra = charts.extra.filter((name) => name !== attribute);
    return;
  }
  if (!charts.dismissed.includes(attribute)) charts.dismissed.push(attribute);
}

export function clearDismissed() {
  charts.dismissed = [];
}

/**
 * What identifies the numbers on screen. Keyed on the Variant list, not the
 * node id: that list is what the backend is asked about, so view-level pruning
 * invalidates the slot without enumerating the ways it can change.
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
 * The most recent request. A fetch that finds this changed under it drops its
 * answer, so the node clicked last wins over the query that finished last.
 */
let latest: string | null = null;

/**
 * Fetches the selected node's Distributions unless they are already in hand.
 * Refuses while the tree is stale: the node is named to the backend by Variant
 * keys taken from the tree on screen, which under different chains would
 * describe a case set matching neither the drawing nor the filters.
 */
export async function loadDistributions(project: Project, attributes: string[]) {
  const tree = built.tree;
  const nodeId = selected.id;
  if (!tree || nodeId === null || isStale() || attributes.length === 0) return;

  const depth = nodeDepth(tree, nodeId);
  // The Start root has no event of its own, so `atStep` has nothing to count.
  if (charts.scope === "atStep" && depth === 0) return;

  const visible = visibleNodes(tree, view, selectedVariants());
  const variants = subtreeVariants(tree, visible, nodeId);
  const next = key(nodeId, depth, variants, attributes, charts.scope);
  if (loaded.key === next || latest === next) return;

  latest = next;
  loaded.loading = true;
  loaded.error = null;
  try {
    const data = await nodeDistributions(
      project,
      comparedIds(),
      attributes,
      variants,
      depth,
      charts.scope
    );
    if (latest !== next) return;
    loaded.data = data;
    loaded.key = next;
  } catch (cause) {
    if (latest !== next) return;
    loaded.error = String(cause);
    loaded.data = null;
    loaded.key = null;
  } finally {
    if (latest === next) loaded.loading = false;
  }
}

/** Drops numbers belonging to another node, tree or project. */
export function forgetDistributions() {
  latest = null;
  loaded.key = null;
  loaded.data = null;
  loaded.error = null;
  loaded.loading = false;
}

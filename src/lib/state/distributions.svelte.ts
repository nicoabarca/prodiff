/**
 * The Distributions view's state. In-memory module `$state` like `view` in
 * `tree.svelte.ts` rather than a persisted table like `settings`: nothing here
 * is a build input, and the tree these numbers describe is itself memory-only,
 * so a lens restored after a reload would have no page left to apply to.
 *
 * The lens is not a property of a node — selecting another node keeps the Scope,
 * the sort and the hand-added attributes and refetches for the new node, which
 * is how walking down a path shows the same histograms shifting.
 */

import {
  nodeDistributions,
  type Encoding,
  type NodeDistributions,
  type Scope,
  type Sort
} from "$lib/distributions";
import { built, groupChains, isStale, selected } from "$lib/state/tree.svelte";
import { nodeDepth, subtreeVariants, visibleNodes } from "$lib/tree";
import { selectedVariants, view } from "$lib/state/tree.svelte";
import type { Project } from "$lib/event-log/types";

/**
 * What is charted, beyond the node's own tested attributes.
 *
 * `extra` outlives a node change — an attribute the build never tested is
 * looked up on purpose, and re-adding it at every step would make walking the
 * path unusable. `dismissed` does not: it hides a card at the node being read,
 * and a tested attribute is part of what the next node has to say.
 */
export const charts = $state<{
  scope: Scope;
  sort: Sort;
  /**
   * How duration cards draw. One setting for all of them rather than one each:
   * there are only ever two such attributes, and reading Activity Duration as a
   * curve while Transition Time is a box makes them harder to compare, not
   * easier. Opens on the curve — see `duration-plot.svelte`.
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

/** Opens a card for an attribute the build never tested. */
export function addExtra(attribute: string) {
  charts.dismissed = charts.dismissed.filter((name) => name !== attribute);
  if (!charts.extra.includes(attribute)) charts.extra.push(attribute);
}

/**
 * Closes a card. A hand-added attribute goes away for good — it was opened on
 * purpose, so closing it is the same intent in reverse. A tested one is only
 * hidden here, and comes back at the next node.
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
 * The most recent request. A fetch that finds this changed under it was
 * superseded while in flight and drops its answer, so clicking down the tree
 * faster than the backend replies lands on the node clicked last rather than
 * on whichever query happened to finish last.
 */
let latest: string | null = null;

/**
 * Fetches the selected node's Distributions unless they are already in hand.
 *
 * Refuses while the tree is stale. The node is named to the backend by the
 * Variant keys of its subtree's leaves, which come from the tree on screen —
 * querying those under chains the tree was not built with would describe a case
 * set matching neither the drawing nor the filters. The view says so and offers
 * a rebuild instead.
 */
export async function loadDistributions(project: Project, attributes: string[]) {
  const tree = built.tree;
  const nodeId = selected.id;
  if (!tree || nodeId === null || isStale() || attributes.length === 0) return;

  const depth = nodeDepth(tree, nodeId);
  // The Start root has no event of its own, so `atStep` has nothing to count.
  if (charts.scope === "atStep" && depth === 0) return;

  const chains = groupChains();
  if (!chains) return;

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
      chains.a,
      chains.b,
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

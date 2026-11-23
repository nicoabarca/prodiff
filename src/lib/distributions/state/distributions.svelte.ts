/**
 * The Distributions view's state, in memory only. Selecting another node keeps
 * the Scope, the sort and the hand-added attributes, and refetches.
 */

import { nodeDistributions } from "$lib/distributions/invokers/node-distributions";
import type { ResponseNodeDistributions } from "$lib/distributions/invokers/types";
import type { Encoding, Scope, Sort } from "$lib/distributions/types";
import { built, isStale } from "$lib/tree/state/build.svelte";
import { comparedIds, relationReady } from "$lib/groups/state/comparison.svelte";
import { selectedNode } from "$lib/tree/state/tree.svelte";
import { nodeDepth, nodeTarget, subtreeVariants, visibleNodes } from "$lib/tree/utils/tree";
import { treeOutliers } from "$lib/tree/invokers/tree-outliers";
import type { OutlierLoad } from "$lib/analysis/types";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
import type { Visible } from "$lib/tree/types";
import { selectedVariants, view } from "$lib/tree/state/tree.svelte";
import type { Project } from "$lib/event-log/types";

/**
 * What is charted, beyond the node's own tested attributes. `extra` and
 * `dismissed` both outlive a node change and are dropped on a new build.
 */
export const charts = $state<{
  scope: Scope;
  sort: Sort;
  /** How duration cards draw: one setting for all of them. Opens on the curve. */
  encoding: Encoding;
  /** Attributes the build never tested, added by hand. */
  extra: string[];
  /** Cards hidden until the next build. */
  dismissed: string[];
  /** Cards showing every category, not just the top twelve. */
  expanded: string[];
}>({
  scope: "atStep",
  sort: "difference",
  encoding: "ecdf",
  extra: [],
  dismissed: [],
  expanded: []
});

/** The numbers for the current node, in one keyed slot. */
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

/** Closes a card, whether the build tested the attribute or a hand added it. */
export function dismiss(attribute: string) {
  charts.expanded = charts.expanded.filter((name) => name !== attribute);
  if (!charts.dismissed.includes(attribute)) charts.dismissed.push(attribute);
}

export function clearDismissed() {
  charts.dismissed = [];
}

export function resetDistributions() {
  charts.extra = [];
  clearDismissed();
  forgetDistributions();
}

/**
 * What identifies the numbers on screen. Keyed on the Variant list, not the node
 * id: that list is what the backend is asked about, so view-level pruning
 * invalidates the slot.
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

/** The inputs of the request whose numbers are on screen, for asking about the same cases again. */
let request: {
  project: Project;
  groups: string[];
  tree: ResponseDirectedTree;
  visible: Visible;
  nodeId: number;
  scope: Scope;
} | null = null;

/**
 * Fetches the selected node's Distributions unless they are already in hand.
 * Refuses while the tree is stale: the node is named to the backend by Variant
 * keys taken from the tree on screen.
 */
export async function loadDistributions(project: Project, attributes: string[]) {
  const tree = built.tree;
  const nodeId = selectedNode();
  if (!tree || nodeId === null || isStale() || attributes.length === 0 || !relationReady()) return;

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
  const groups = comparedIds();
  const scope = charts.scope;
  try {
    const data = await nodeDistributions(project, groups, attributes, variants, depth, scope);
    if (latest !== next) return;
    loaded.data = data;
    loaded.key = next;
    request = { project, groups, tree, visible, nodeId, scope };
  } catch (cause) {
    if (latest !== next) return;
    loaded.error = String(cause);
    loaded.data = null;
    loaded.key = null;
    request = null;
  } finally {
    if (latest === next) loaded.loading = false;
  }
}

/** Drops numbers belonging to another node, tree or project. */
export function forgetDistributions() {
  latest = null;
  request = null;
  loaded.key = null;
  loaded.data = null;
  loaded.error = null;
  loaded.loading = false;
}

/**
 * Fetches one duration plot's outliers over the cases its box describes,
 * `undefined` while no numbers are on screen.
 */
export function distributionOutliers(attribute: string): OutlierLoad | undefined {
  if (!request) return undefined;
  const { project, groups, tree, visible, nodeId, scope } = request;
  return () =>
    treeOutliers(project, groups, nodeTarget(tree, visible, nodeId, scope, attribute, true));
}

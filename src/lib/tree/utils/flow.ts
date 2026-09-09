/**
 * Turns a Directed Tree into what Svelte Flow renders. `layoutTree` places the
 * nodes; everything else here is the face of one node and the weight of one
 * edge.
 */
import type { Edge, Node } from "@xyflow/svelte";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type { EffectBand, GroupFocus, Secondary, Visible } from "$lib/tree/types";
import { effectBand, effectStep, peakEffect } from "$lib/tree/utils/effect";
import { isDurationAttribute } from "$lib/analysis/attributes";
import { layoutTree } from "$lib/tree/utils/layout";
import {
  children,
  groupCasesAt,
  groupIds,
  isDivergent,
  membership
} from "$lib/tree/utils/tree";
import { formatDuration, formatNumber } from "$lib/format";

// Narrow enough that a deep tree fits on screen; activity names wrap to three
// lines inside it.
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 80;
const RANK_SEP = 60;
const NODE_SEP = 24;

export function stableKeys(tree: ResponseDirectedTree): Map<number, string> {
  const keys = new Map<number, string>();
  const ordered = [...tree.nodes].sort((a, b) => a.id - b.id);
  for (const node of ordered) {
    const segment = `${node.label
      .replaceAll("\\", "\\\\")
      .replaceAll("/", "\\/")
      .replaceAll("!", "\\!")}${node.variantKey === null ? "" : "!"}`;
    const parent = node.parent === null ? "" : (keys.get(node.parent) ?? "");
    keys.set(node.id, parent === "" ? segment : `${parent}/${segment}`);
  }
  return keys;
}

/** One Group as the canvas needs it: what to call it and what colour to use. */
export interface FlowGroup {
  id: string;
  name: string;
  color: string;
}

export interface TreeNodeData {
  nodeId: number;
  label: string;
  membership: string;
  groups: FlowGroup[];
  secondaries: (string | null)[];
  significantCount: number;
  peakBand: EffectBand | null;
  peakStep: 1 | 2 | 3 | 4 | null;
  divergent: boolean;
  dimmed: boolean;
  selected: boolean;
  highlighted: boolean;
  hiddenBelow: number;
  hasChildren: boolean;
  entering: boolean;
  ghost: boolean;
  onToggleCollapse: () => void;
  [key: string]: unknown;
}

function significantCount(node: TreeNode): number {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  return blocks.filter((block) => block?.test?.significant).length;
}

/**
 * The node's second line, one entry per Group so each carries its colour. An
 * entry is `null` when that Group has nothing at this node.
 *
 * `secondary` is either `"cases"`, one Group's id, which shows that Group's
 * count alone, or an attribute name, which shows its mean.
 */
function secondaryLabels(
  node: TreeNode,
  secondary: Secondary,
  cases: Record<string, number>,
  ids: string[]
): (string | null)[] {
  if (secondary === "cases" || ids.includes(secondary)) {
    return ids.map((id) => {
      const count = cases[id] ?? 0;
      if (count === 0) return null;
      return secondary !== "cases" && secondary !== id ? null : formatNumber(count);
    });
  }

  const block = secondary === "Transition Time" ? node.transitionTime : node.eventLevel[secondary];
  const format = (value: number) =>
    isDurationAttribute(secondary) ? formatDuration(value) : formatNumber(Math.round(value));
  return ids.map((id) => {
    const summary = block?.summaries[id];
    return summary?.type === "numerical" ? format(summary.mean) : null;
  });
}

function dimmed(node: TreeNode, focus: GroupFocus, ids: string[]): boolean {
  if (focus === "all") return false;
  return membership(node, ids) !== focus;
}

export interface FlowOptions {
  groups: FlowGroup[];
  secondary: Secondary;
  focus: GroupFocus;
  edgeLabels: boolean;
  selected: number | null;
  onToggleCollapse: (id: number) => void;
}

/**
 * The edge's label: mean Transition Time per Group. Empty unless Transition
 * Time was one of the attributes built.
 */
function edgeLabel(node: TreeNode, groups: FlowGroup[]): string | undefined {
  const block = node.transitionTime;
  if (!block) return undefined;
  const parts = groups
    .map((group) => {
      const summary = block.summaries[group.id];
      return summary?.type === "numerical" ? `${group.name} ${formatDuration(summary.mean)}` : null;
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * Lays out the visible part of the tree. Edge thickness is the combined case
 * volume flowing into the child, scaled against the busiest edge on screen.
 */
export function toFlow(
  tree: ResponseDirectedTree,
  visible: Visible,
  options: FlowOptions
): { nodes: Node[]; edges: Edge[]; keys: Map<number, string> } {
  const shown = tree.nodes.filter((node) => visible.ids.has(node.id));
  const kids = children(tree);
  const ids = groupIds(tree);
  const keys = stableKeys(tree);

  const nodeCases = (node: TreeNode) => {
    const counted = visible.cases.get(node.id);
    return counted ? Object.values(counted).reduce((sum, cases) => sum + cases, 0) : 0;
  };
  const casesById = new Map(shown.map((node) => [node.id, nodeCases(node)]));
  const placed = layoutTree(shown, {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    rankSep: RANK_SEP,
    nodeSep: NODE_SEP,
    volume: (id) => casesById.get(id) ?? 0,
    orderKey: (id) => keys.get(id) ?? ""
  });

  const busiest = Math.max(1, ...casesById.values());

  const nodes: Node[] = shown.map((node) => {
    const point = placed.get(node.id) ?? { x: 0, y: 0 };
    const cases = visible.cases.get(node.id) ?? {};
    const secondaries = secondaryLabels(node, options.secondary, cases, ids);
    const peak = peakEffect(node);
    const key = keys.get(node.id) as string;
    return {
      id: key,
      type: "activity",
      position: { x: point.x, y: point.y },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: false,
      data: {
        nodeId: node.id,
        label: node.label,
        membership: membership(node, ids),
        groups: options.groups,
        secondaries,
        significantCount: significantCount(node),
        peakBand: peak === null ? null : effectBand(peak),
        peakStep: peak === null ? null : effectStep(peak),
        divergent: isDivergent(node),
        dimmed: dimmed(node, options.focus, ids),
        selected: options.selected === node.id,
        highlighted: false,
        hiddenBelow: visible.hiddenBelow.get(node.id) ?? 0,
        hasChildren: (kids.get(node.id) ?? []).some((id) => visible.ids.has(id)),
        entering: false,
        ghost: false,
        onToggleCollapse: () => options.onToggleCollapse(node.id)
      } satisfies TreeNodeData
    };
  });

  const edges: Edge[] = shown
    .filter((node) => node.parent !== null && visible.ids.has(node.parent))
    .map((node) => ({
      id: `${keys.get(node.parent as number)}->${keys.get(node.id)}`,
      source: keys.get(node.parent as number) as string,
      target: keys.get(node.id) as string,
      type: "smoothstep",
      label: options.edgeLabels ? edgeLabel(node, options.groups) : undefined,
      labelStyle:
        "font-size:0.625rem;font-family:ui-monospace,monospace;color:var(--muted-foreground);background:var(--background);padding:0 0.25rem;white-space:nowrap",
      style: `stroke-width:${(0.5 + ((casesById.get(node.id) ?? 0) / busiest) * 5).toFixed(2)}`,
      // Significance is a property of nodes, so dimming follows the child.
      class: dimmed(node, options.focus, ids) ? "opacity-25" : undefined
    }));

  return { nodes, edges, keys };
}

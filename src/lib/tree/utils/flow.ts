/**
 * Turns a Directed Tree into what Svelte Flow renders. `layoutTree` places the
 * nodes; everything else here is the face of one node and the weight of one
 * edge.
 */
import type { Edge, Node } from "@xyflow/svelte";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type { EdgeWidth, EffectBand, GroupFocus, Statistic, Visible } from "$lib/tree/types";
import { effectBand, effectStep, peakEffect } from "$lib/tree/utils/effect";
import { nodeFigures, type NodeFigure } from "$lib/tree/utils/figure";
import { layoutTree } from "$lib/tree/utils/layout";
import { children, groupCasesAt, groupIds, isDivergent, membership } from "$lib/tree/utils/tree";
import { formatDuration } from "$lib/format";

// Narrow enough that a deep tree fits on screen; activity names wrap to three
// lines inside it.
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 80;
const RANK_SEP = 60;
const NODE_SEP = 24;
const UNIFORM_EDGE_WIDTH = 1.5;

// Svelte Flow draws an edge label in a portal outside the edge group, so a
// class on the edge never reaches it and its dimming rides on this style.
export const EDGE_LABEL_STYLE =
  "font-size:0.625rem;font-family:ui-monospace,monospace;color:var(--muted-foreground);background:var(--background);padding:0 0.25rem;white-space:nowrap";

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
  root: boolean;
  membership: string;
  groups: FlowGroup[];
  figures: (string | null)[];
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

/** A focus naming a Group no longer compared dims nothing. */
function dimmed(node: TreeNode, focus: GroupFocus, ids: string[]): boolean {
  if (focus === "shared") return ids.length > 1 && membership(node, ids) !== "shared";
  return ids.includes(focus) && groupCasesAt(node, focus) === 0;
}

export interface FlowOptions {
  groups: FlowGroup[];
  figure: NodeFigure;
  statistic: Statistic;
  focus: GroupFocus;
  edgeLabels: boolean;
  edgeWidth: EdgeWidth;
  selected: number | null;
  onToggleCollapse: (id: number) => void;
}

/** One Group's Transition Time on an edge, drawn beside a dot in its colour. */
export interface EdgeWait {
  id: string;
  color: string;
  value: string;
}

export interface TreeEdgeData {
  waits: EdgeWait[];
  [key: string]: unknown;
}

/**
 * The edge's label: Transition Time per Group, in the order compared. Empty
 * unless Transition Time was one of the attributes built.
 */
export function edgeWaits(node: TreeNode, groups: FlowGroup[], statistic: Statistic): EdgeWait[] {
  const block = node.transitionTime;
  if (!block) return [];
  return groups.flatMap((group) => {
    const summary = block.summaries[group.id];
    if (summary?.type !== "numerical") return [];
    return [{ id: group.id, color: group.color, value: formatDuration(summary[statistic]) }];
  });
}

/**
 * Lays out the visible part of the tree. Unless the view asks for a uniform
 * width, edge thickness is the combined case volume flowing into the child,
 * scaled against the busiest edge on screen.
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
  // The Start root is synthetic, so the edges leaving it are drawn dashed.
  const roots = new Set(shown.filter((node) => node.parent === null).map((node) => node.id));

  const nodes: Node[] = shown.map((node) => {
    const point = placed.get(node.id) ?? { x: 0, y: 0 };
    const cases = visible.cases.get(node.id) ?? {};
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
        root: node.parent === null,
        membership: membership(node, ids),
        groups: options.groups,
        figures: nodeFigures(node, options.figure, options.statistic, cases, tree.groups),
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
      type: "wait",
      data: {
        waits: options.edgeLabels ? edgeWaits(node, options.groups, options.statistic) : []
      } satisfies TreeEdgeData,
      labelStyle: dimmed(node, options.focus, ids)
        ? `${EDGE_LABEL_STYLE};opacity:0.25`
        : EDGE_LABEL_STYLE,
      style: `stroke-width:${
        options.edgeWidth === "uniform"
          ? UNIFORM_EDGE_WIDTH
          : (0.5 + ((casesById.get(node.id) ?? 0) / busiest) * 5).toFixed(2)
      }${roots.has(node.parent as number) ? ";stroke-dasharray:4 3" : ""}`,
      // Significance is a property of nodes, so dimming follows the child.
      class: dimmed(node, options.focus, ids) ? "opacity-25" : undefined
    }));

  return { nodes, edges, keys };
}

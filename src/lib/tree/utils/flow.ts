/**
 * Turns a Directed Tree into what Svelte Flow renders. Dagre does the layout;
 * its centre-anchored coordinates are converted to Svelte Flow's top-left.
 */
import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/svelte";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type { Direction, EffectBand, GroupFocus, Secondary, Visible } from "$lib/tree/types";
import { effectBand, effectStep, peakEffect } from "$lib/tree/utils/effect";
import { isDurationAttribute } from "$lib/tree/utils/settings";
import { children, isDivergent, membership } from "$lib/tree/utils/tree";
import { formatDuration, formatNumber } from "$lib/format";

// Narrow enough that a deep tree fits on screen; activity names wrap to three
// lines inside it rather than widening every node to the longest one.
export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 80;

export interface TreeNodeData {
  label: string;
  membership: "a" | "b" | "shared";
  /** Per-Group halves of the node's second line, each in its Group's colour. */
  secondaryA: string | null;
  secondaryB: string | null;
  significantCount: number;
  /** Strongest significant effect here, in words and as a ramp step. */
  peakBand: EffectBand | null;
  peakStep: 1 | 2 | 3 | 4 | null;
  divergent: boolean;
  dimmed: boolean;
  selected: boolean;
  /** On the Variant the picker is hovering. Set after layout, in the canvas. */
  highlighted: boolean;
  hiddenBelow: number;
  hasChildren: boolean;
  direction: Direction;
  onToggleCollapse: () => void;
  [key: string]: unknown;
}

function significantCount(node: TreeNode): number {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  return blocks.filter((block) => block?.test?.significant).length;
}

/**
 * The node's second line, split per Group so each half carries its colour.
 * A half is `null` when that Group has nothing at this node.
 */
function secondaryLabels(
  node: TreeNode,
  secondary: Secondary,
  cases: { groupACases: number; groupBCases: number }
): [string | null, string | null] {
  if (secondary === "cases" || secondary === "casesA" || secondary === "casesB") {
    const a =
      secondary === "casesB" || cases.groupACases === 0 ? null : formatNumber(cases.groupACases);
    const b =
      secondary === "casesA" || cases.groupBCases === 0 ? null : formatNumber(cases.groupBCases);
    return [a, b];
  }

  const block = secondary === "Transition Time" ? node.transitionTime : node.eventLevel[secondary];
  const format = (value: number) =>
    isDurationAttribute(secondary) ? formatDuration(value) : formatNumber(Math.round(value));
  const mean = (side: "groupA" | "groupB") => {
    const summary = block?.[side];
    return summary?.type === "numerical" ? format(summary.mean) : null;
  };
  return [mean("groupA"), mean("groupB")];
}

function dimmed(node: TreeNode, focus: GroupFocus): boolean {
  if (focus === "all") return false;
  return membership(node) !== focus;
}

export interface FlowOptions {
  direction: Direction;
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
function edgeLabel(node: TreeNode): string | undefined {
  const block = node.transitionTime;
  if (!block) return undefined;
  const side = (summary: typeof block.groupA, name: string) =>
    summary?.type === "numerical" ? `${name} ${formatDuration(summary.mean)}` : null;
  const parts = [side(block.groupA, "A"), side(block.groupB, "B")].filter(Boolean);
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
): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: options.direction, ranksep: 60, nodesep: 24 });

  const shown = tree.nodes.filter((node) => visible.ids.has(node.id));
  const kids = children(tree);
  for (const node of shown) {
    graph.setNode(String(node.id), { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const node of shown) {
    if (node.parent !== null && visible.ids.has(node.parent)) {
      graph.setEdge(String(node.parent), String(node.id));
    }
  }
  dagre.layout(graph);

  const nodeCases = (node: TreeNode) => {
    const c = visible.cases.get(node.id);
    return c ? c.groupACases + c.groupBCases : 0;
  };
  const busiest = Math.max(1, ...shown.map(nodeCases));
  const vertical = options.direction === "TB";

  const nodes: Node[] = shown.map((node) => {
    const placed = graph.node(String(node.id));
    const cases = visible.cases.get(node.id) ?? { groupACases: 0, groupBCases: 0 };
    const [secondaryA, secondaryB] = secondaryLabels(node, options.secondary, cases);
    const peak = peakEffect(node);
    return {
      id: String(node.id),
      type: "activity",
      // Dagre anchors at the centre; Svelte Flow at the top-left corner.
      position: { x: placed.x - NODE_WIDTH / 2, y: placed.y - NODE_HEIGHT / 2 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: false,
      data: {
        label: node.label,
        membership: membership(node),
        secondaryA,
        secondaryB,
        significantCount: significantCount(node),
        peakBand: peak === null ? null : effectBand(peak),
        peakStep: peak === null ? null : effectStep(peak),
        divergent: isDivergent(node),
        dimmed: dimmed(node, options.focus),
        selected: options.selected === node.id,
        highlighted: false,
        hiddenBelow: visible.hiddenBelow.get(node.id) ?? 0,
        hasChildren: (kids.get(node.id) ?? []).some((id) => visible.ids.has(id)),
        direction: options.direction,
        onToggleCollapse: () => options.onToggleCollapse(node.id)
      } satisfies TreeNodeData
    };
  });

  const edges: Edge[] = shown
    .filter((node) => node.parent !== null && visible.ids.has(node.parent))
    .map((node) => ({
      id: `${node.parent}-${node.id}`,
      source: String(node.parent),
      target: String(node.id),
      type: vertical ? "smoothstep" : "bezier",
      label: options.edgeLabels ? edgeLabel(node) : undefined,
      labelStyle:
        "font-size:0.625rem;font-family:ui-monospace,monospace;color:var(--muted-foreground);background:var(--background);padding:0 0.25rem;white-space:nowrap",
      style: `stroke-width:${(0.5 + (nodeCases(node) / busiest) * 5).toFixed(2)}`,
      // Significance is a property of nodes, so dimming follows the child.
      class: dimmed(node, options.focus) ? "opacity-25" : undefined
    }));

  return { nodes, edges };
}

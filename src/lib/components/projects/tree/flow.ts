/**
 * Turns a Directed Tree into what Svelte Flow renders. Svelte Flow supplies no
 * layout, so Dagre places the nodes and the result is converted from its
 * centre-anchored coordinates to Svelte Flow's top-left ones.
 */
import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/svelte";
import {
  children,
  isDivergent,
  isDurationAttribute,
  membership,
  nodeCases,
  type Direction,
  type DirectedTree,
  type GroupFocus,
  type Secondary,
  type TreeNode,
  type Visible
} from "$lib/tree";
import { formatDuration, formatNumber } from "$lib/format";

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 72;

export interface TreeNodeData {
  label: string;
  membership: "a" | "b" | "shared";
  secondary: string;
  significantCount: number;
  divergent: boolean;
  dimmed: boolean;
  selected: boolean;
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

/** The node's second line. Means come straight off the shipped aggregates. */
function secondaryLabel(node: TreeNode, secondary: Secondary): string {
  if (secondary === "cases") {
    return `A ${formatNumber(node.groupACases)} · B ${formatNumber(node.groupBCases)}`;
  }
  if (secondary === "casesA") return `A ${formatNumber(node.groupACases)}`;
  if (secondary === "casesB") return `B ${formatNumber(node.groupBCases)}`;

  const block = secondary === "Transition Time" ? node.transitionTime : node.eventLevel[secondary];
  const format = (value: number) =>
    isDurationAttribute(secondary) ? formatDuration(value) : formatNumber(Math.round(value));
  const mean = (side: "groupA" | "groupB") => {
    const summary = block?.[side];
    return summary?.type === "numerical" ? format(summary.mean) : "—";
  };
  return `A ${mean("groupA")} · B ${mean("groupB")}`;
}

function dimmed(node: TreeNode, focus: GroupFocus): boolean {
  if (focus === "all") return false;
  return membership(node) !== focus;
}

export interface FlowOptions {
  direction: Direction;
  secondary: Secondary;
  focus: GroupFocus;
  selected: number | null;
  onToggleCollapse: (id: number) => void;
}

/**
 * Lays out the visible part of the tree. Edge thickness is the combined case
 * volume flowing into the child, scaled against the busiest edge on screen.
 */
export function toFlow(
  tree: DirectedTree,
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

  const busiest = Math.max(1, ...shown.map(nodeCases));
  const vertical = options.direction === "TB";

  const nodes: Node[] = shown.map((node) => {
    const placed = graph.node(String(node.id));
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
        secondary: secondaryLabel(node, options.secondary),
        significantCount: significantCount(node),
        divergent: isDivergent(node),
        dimmed: dimmed(node, options.focus),
        selected: options.selected === node.id,
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
      style: `stroke-width:${(0.5 + (nodeCases(node) / busiest) * 5).toFixed(2)}`,
      // Significance is a property of nodes, so dimming follows the child.
      class: dimmed(node, options.focus) ? "opacity-25" : undefined
    }));

  return { nodes, edges };
}

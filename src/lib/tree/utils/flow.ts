/**
 * Turns a Directed Tree into what Svelte Flow renders. `layoutTree` places the
 * nodes; everything else here is the face of one node and the weight of one
 * edge.
 */
import type { Edge, Node } from "@xyflow/svelte";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type {
  EdgeWidth,
  EffectBand,
  GroupFocus,
  Statistic,
  TreeSelection,
  Visible
} from "$lib/tree/types";
import { edgeEffect, effectBand, effectStep, peakEffect } from "$lib/tree/utils/effect";
import { nodeFigures, type NodeFigure } from "$lib/tree/utils/figure";
import { layoutTree } from "$lib/tree/utils/layout";
import { MIN_HEIGHT, MIN_WIDTH, nodeSize } from "$lib/tree/utils/node-size";
import { caseSplit, children, groupCasesAt, groupIds, membership } from "$lib/tree/utils/tree";
import { formatCompact, formatDuration, formatPercent } from "$lib/format";

const RANK_SEP = 60;
const NODE_SEP = 24;
const UNIFORM_EDGE_WIDTH = 1.5;

// Svelte Flow draws an edge label in a portal outside the edge group, so a
// class on the edge never reaches it and its dimming rides on this style.
export const EDGE_LABEL_STYLE =
  "font-size:0.8125rem;font-family:ui-monospace,monospace;color:var(--edge-label);background:var(--background);padding:0 0.25rem;white-space:nowrap";

type Face = Pick<TreeNodeData, "cases" | "split" | "figures">;

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
  cases: Record<string, number>;
  split: Record<string, number>;
  figures: (string | null)[];
  significantCount: number;
  peakBand: EffectBand | null;
  peakStep: 1 | 2 | 3 | 4 | null;
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
  return Object.values(node.eventLevel).filter((block) => block.test?.significant).length;
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
  selected: TreeSelection | null;
  onToggleCollapse: (id: number) => void;
  onSelectEdge: (childId: number) => void;
}

/** One Group's Transition Time on an edge, drawn beside a dot in its colour. */
export interface EdgeWait {
  id: string;
  color: string;
  value: string;
}

/** A significant Transition Time difference on an edge, drawn as a dot in its effect step. */
export interface EdgeFinding {
  band: EffectBand;
  step: 1 | 2 | 3 | 4;
}

/**
 * The Group colour an edge is painted in where only that Group's cases run.
 * `trunk` is true when its parent belongs to the same Group, so the whole edge
 * is that Group's. Otherwise the colour starts on the fork's horizontal run
 * `from` flow units right of the parent's centre (negative is left): past the
 * last sibling on that side that belongs to another Group or is shared, where
 * only this Group's edges still run.
 */
export interface EdgeOwner {
  color: string;
  trunk: boolean;
  from: number;
}

/** An edge is clickable when it carries Transition Time; the edges leaving Start never do. */
export interface TreeEdgeData {
  childId: number;
  waits: EdgeWait[];
  finding: EdgeFinding | null;
  owner: EdgeOwner | null;
  clickable: boolean;
  selected: boolean;
  onSelect: () => void;
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
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));

  const nodeCases = (node: TreeNode) => {
    const counted = visible.cases.get(node.id);
    return counted ? Object.values(counted).reduce((sum, cases) => sum + cases, 0) : 0;
  };
  const casesById = new Map(shown.map((node) => [node.id, nodeCases(node)]));
  const faces = new Map<number, Face>(
    shown.map((node) => {
      const cases = visible.cases.get(node.id) ?? {};
      const figures =
        options.figure.kind === "cases"
          ? []
          : nodeFigures(node, options.figure, options.statistic, cases, tree.groups);
      return [node.id, { cases, split: caseSplit(cases), figures }];
    })
  );
  const sizeOf = (node: TreeNode) => {
    if (node.parent === null) return { width: MIN_WIDTH, height: MIN_HEIGHT };
    const { cases, split, figures } = faces.get(node.id) as Face;
    const reaching = options.groups.filter((group) => (cases[group.id] ?? 0) > 0);
    const shared = reaching.length > 1;
    return nodeSize({
      label: node.label,
      total: shared ? formatCompact(casesById.get(node.id) ?? 0) : null,
      counts: reaching.map(
        (group) =>
          formatCompact(cases[group.id]) + (shared ? ` (${formatPercent(split[group.id])})` : "")
      ),
      figures: figures.filter((figure) => figure !== null && figure !== undefined)
    });
  };
  const placed = layoutTree(shown, {
    size: (id) => sizeOf(byId.get(id) as TreeNode),
    rankSep: RANK_SEP,
    nodeSep: NODE_SEP,
    volume: (id) => casesById.get(id) ?? 0,
    orderKey: (id) => keys.get(id) ?? ""
  });

  const owner = (node: TreeNode): EdgeOwner | null => {
    if (ids.length < 2) return null;
    const own = membership(node, ids);
    const group = options.groups.find((candidate) => candidate.id === own);
    if (!group) return null;
    const parent = byId.get(node.parent as number);
    if (parent !== undefined && membership(parent, ids) === own) {
      return { color: group.color, trunk: true, from: 0 };
    }
    const centre = (id: number) => {
      const box = placed.get(id);
      return box ? box.x + box.width / 2 : 0;
    };
    const reach = centre(node.id) - centre(node.parent as number);
    const blockers = shown
      .filter((sibling) => sibling.parent === node.parent && sibling.id !== node.id)
      .filter((sibling) => membership(sibling, ids) !== own)
      .map((sibling) => centre(sibling.id) - centre(node.parent as number))
      .filter(
        (offset) => Math.sign(offset) === Math.sign(reach) && Math.abs(offset) < Math.abs(reach)
      );
    const from = blockers.reduce(
      (farthest, offset) => (Math.abs(offset) > Math.abs(farthest) ? offset : farthest),
      0
    );
    return { color: group.color, trunk: false, from };
  };

  const busiest = Math.max(1, ...casesById.values());
  // The Start root is synthetic, so the edges leaving it are drawn dashed.
  const roots = new Set(shown.filter((node) => node.parent === null).map((node) => node.id));

  const nodes: Node[] = shown.map((node) => {
    const box = placed.get(node.id) ?? { x: 0, y: 0, width: 0, height: 0 };
    const { cases, split, figures } = faces.get(node.id) as Face;
    const peak = peakEffect(node);
    const key = keys.get(node.id) as string;
    return {
      id: key,
      type: "activity",
      position: { x: box.x, y: box.y },
      width: box.width,
      height: box.height,
      draggable: false,
      data: {
        nodeId: node.id,
        label: node.label,
        root: node.parent === null,
        membership: membership(node, ids),
        groups: options.groups,
        cases,
        split,
        figures,
        significantCount: significantCount(node),
        peakBand: peak === null ? null : effectBand(peak),
        peakStep: peak === null ? null : effectStep(peak),
        dimmed: dimmed(node, options.focus, ids),
        selected: options.selected?.kind === "node" && options.selected.id === node.id,
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
    .map((node) => {
      const effect = edgeEffect(node);
      const selected = options.selected?.kind === "edge" && options.selected.childId === node.id;
      const scaled = 0.5 + ((casesById.get(node.id) ?? 0) / busiest) * 5;
      const width = options.edgeWidth === "uniform" ? UNIFORM_EDGE_WIDTH : scaled;
      const stroke = selected
        ? Math.max(width, 2.5).toFixed(2)
        : options.edgeWidth === "uniform"
          ? String(UNIFORM_EDGE_WIDTH)
          : scaled.toFixed(2);
      return {
        id: `${keys.get(node.parent as number)}->${keys.get(node.id)}`,
        source: keys.get(node.parent as number) as string,
        target: keys.get(node.id) as string,
        type: "wait",
        data: {
          childId: node.id,
          waits: options.edgeLabels ? edgeWaits(node, options.groups, options.statistic) : [],
          finding: effect === null ? null : { band: effectBand(effect), step: effectStep(effect) },
          owner: selected ? null : owner(node),
          clickable: node.transitionTime !== null && !roots.has(node.parent as number),
          selected,
          onSelect: () => options.onSelectEdge(node.id)
        } satisfies TreeEdgeData,
        labelStyle: dimmed(node, options.focus, ids)
          ? `${EDGE_LABEL_STYLE};opacity:0.25`
          : EDGE_LABEL_STYLE,
        style: `stroke-width:${stroke}${
          selected ? ";stroke:var(--ring)" : ""
        }${roots.has(node.parent as number) ? ";stroke-dasharray:4 3" : ""}`,
        // An edge dims with the node it leads into.
        class: dimmed(node, options.focus, ids) ? "opacity-25" : undefined
      };
    });

  return { nodes, edges, keys };
}

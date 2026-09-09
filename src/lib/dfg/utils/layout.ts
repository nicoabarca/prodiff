/** Positions and routes a simplified DFG with ELK. */
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { END_ID, START_ID, type Direction, type Measure } from "$lib/dfg/types";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";
import type { Simplified } from "$lib/dfg/utils/simplify";

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 58;
export const TERMINAL_SIZE = 36;

export interface Point {
  x: number;
  y: number;
}

export interface Placement {
  nodes: Map<number, Point>;
  paths: Map<string, string>;
}

const elk = new ELK();
const cache = new Map<string, Placement>();

const CACHE_LIMIT = 12;

export const edgeKey = edgeId;

export const isTerminal = (id: number) => id === START_ID || id === END_ID;

export function nodeSize(id: number): { width: number; height: number } {
  return isTerminal(id)
    ? { width: TERMINAL_SIZE, height: TERMINAL_SIZE }
    : { width: NODE_WIDTH, height: NODE_HEIGHT };
}

/** Cache key for layout topology, direction, and edge priority. */
export function topologyKey(graph: Simplified, direction: Direction, measure: Measure): string {
  return JSON.stringify([
    direction,
    graph.nodes.map((node) => node.id),
    graph.edges.map((edge) => [edge.source, edge.target, unionCount(edge.counts, measure)])
  ]);
}

/** Converts ELK section points to SVG path data. */
function path(points: Point[]): string {
  if (points.length === 0) return "";
  let data = `M${points[0].x},${points[0].y}`;
  let i = 1;
  while (i + 2 < points.length) {
    const [a, b, c] = [points[i], points[i + 1], points[i + 2]];
    data += ` C${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;
    i += 3;
  }
  for (; i < points.length; i++) data += ` L${points[i].x},${points[i].y}`;
  return data;
}

/** Draws a self-loop beside its activity node. */
function selfLoop(corner: Point, id: number, direction: Direction): string {
  const { width, height } = nodeSize(id);
  const reach = 36;
  if (direction === "LR") {
    const startX = corner.x + width * 0.3;
    const endX = corner.x + width * 0.7;
    const y = corner.y + height;
    return `M${startX},${y} C${startX - 4},${y + reach} ${endX + 4},${y + reach} ${endX},${y + 4}`;
  }
  const x = corner.x + width;
  const startY = corner.y + height * 0.3;
  const endY = corner.y + height * 0.7;
  return `M${x},${startY} C${x + reach},${startY - 4} ${x + reach},${endY + 4} ${x + 4},${endY}`;
}

function elkGraph(graph: Simplified, direction: Direction, measure: Measure): ElkNode {
  const routed = graph.edges.filter((edge) => edge.source !== edge.target);
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "TB" ? "DOWN" : "RIGHT",
      "elk.edgeRouting": "SPLINES",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.nodeNode": "90",
      "elk.spacing.edgeNode": "30",
      "elk.spacing.edgeEdge": "20",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.cycleBreaking.strategy": "GREEDY"
    },
    children: graph.nodes.map((node) => ({
      id: String(node.id),
      ...nodeSize(node.id),
      layoutOptions: isTerminal(node.id)
        ? { "elk.layered.layering.layerConstraint": node.id === START_ID ? "FIRST" : "LAST" }
        : ({} as Record<string, string>)
    })),
    edges: routed.map((edge) => ({
      id: edgeKey(edge.source, edge.target),
      sources: [String(edge.source)],
      targets: [String(edge.target)],
      layoutOptions: { "elk.priority": String(Math.round(unionCount(edge.counts, measure))) }
    }))
  };
}

function placementFromElk(graph: Simplified, laid: ElkNode, direction: Direction): Placement {
  const nodes = new Map(
    (laid.children ?? []).map((child) => [Number(child.id), { x: child.x ?? 0, y: child.y ?? 0 }])
  );
  const paths = new Map(
    (laid.edges ?? []).flatMap((edge) => {
      const section = edge.sections?.[0];
      if (!section) return [];
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      return [[edge.id, path(points)] as [string, string]];
    })
  );
  for (const edge of graph.edges) {
    if (edge.source !== edge.target) continue;
    const corner = nodes.get(edge.source);
    if (corner)
      paths.set(edgeKey(edge.source, edge.target), selfLoop(corner, edge.source, direction));
  }
  return { nodes, paths };
}

export async function layout(
  graph: Simplified,
  direction: Direction,
  measure: Measure
): Promise<Placement> {
  const key = topologyKey(graph, direction, measure);
  const hit = cache.get(key);
  if (hit) return hit;

  const placement = placementFromElk(
    graph,
    await elk.layout(elkGraph(graph, direction, measure)),
    direction
  );
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, placement);
  return placement;
}

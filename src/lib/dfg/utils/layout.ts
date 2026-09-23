/** Positions and routes a simplified DFG with ELK. */
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import {
  END_ID,
  START_ID,
  type Direction,
  type Measure,
  type Point,
  type Rect
} from "$lib/dfg/types";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";
import type { Simplified } from "$lib/dfg/utils/simplify";

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 58;
export const TERMINAL_SIZE = 36;

export interface Placement {
  nodes: Map<number, Point>;
  routes: Map<string, Point[]>;
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

/** A handle-to-handle route for the rare edge ELK declines to section. */
export function straightRoute(
  source: Rect | null,
  target: Rect | null,
  direction: Direction
): Point[] {
  if (!source || !target) return [];
  if (direction === "LR") {
    return [
      { x: source.x + source.width, y: source.y + source.height / 2 },
      { x: target.x, y: target.y + target.height / 2 }
    ];
  }
  return [
    { x: source.x + source.width / 2, y: source.y + source.height },
    { x: target.x + target.width / 2, y: target.y }
  ];
}

/** Cache key for layout topology, direction, and edge priority. */
export function topologyKey(graph: Simplified, direction: Direction, measure: Measure): string {
  return JSON.stringify([
    direction,
    graph.nodes.map((node) => node.id),
    graph.edges.map((edge) => [edge.source, edge.target, unionCount(edge.counts, measure)])
  ]);
}

/**
 * Routes a self-loop beside its activity node, as the start point followed by
 * one cubic: the shape every other route already has.
 */
function selfLoop(corner: Point, id: number, direction: Direction): Point[] {
  const { width, height } = nodeSize(id);
  const reach = 36;
  if (direction === "LR") {
    const startX = corner.x + width * 0.3;
    const endX = corner.x + width * 0.7;
    const y = corner.y + height;
    return [
      { x: startX, y },
      { x: startX - 4, y: y + reach },
      { x: endX + 4, y: y + reach },
      { x: endX, y }
    ];
  }
  const x = corner.x + width;
  const startY = corner.y + height * 0.3;
  const endY = corner.y + height * 0.7;
  return [
    { x, y: startY },
    { x: x + reach, y: startY - 4 },
    { x: x + reach, y: endY + 4 },
    { x, y: endY }
  ];
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
      // Start and End each hold a layer of their own. A plain `FIRST` shares
      // the first layer with every activity simplification left without an
      // incoming edge, drawing them level with Start.
      layoutOptions: isTerminal(node.id)
        ? {
            "elk.layered.layering.layerConstraint":
              node.id === START_ID ? "FIRST_SEPARATE" : "LAST_SEPARATE"
          }
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
  const routes = new Map(
    (laid.edges ?? []).flatMap((edge) => {
      const section = edge.sections?.[0];
      if (!section) return [];
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
      return [[edge.id, points] as [string, Point[]]];
    })
  );
  for (const edge of graph.edges) {
    if (edge.source !== edge.target) continue;
    const corner = nodes.get(edge.source);
    if (corner)
      routes.set(edgeKey(edge.source, edge.target), selfLoop(corner, edge.source, direction));
  }
  return { nodes, routes };
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

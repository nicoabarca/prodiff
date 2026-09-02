/**
 * Where the simplified graph goes on screen. ELK does the placement and routes
 * the edges around the boxes, which matters here in a way it does not for a
 * tree: a DFG has cycles, and a router that ignores them draws through nodes.
 *
 * Three things keep the flow readable. Start and End are pinned to the first
 * and last layer. Every edge carries its own count as its ELK priority, so
 * breaking a cycle turns a quiet edge around rather than the busiest one. And a
 * self-loop never reaches ELK at all: it is a bump drawn beside its own box,
 * where ELK would otherwise open a whole layer for it.
 *
 * Two rules keep this cheap. The box is a fixed size, so adding a figure to a
 * face cannot change the topology. And the layout is handed topology, priority
 * and direction only, never labels or styles, so it is cached by exactly those.
 */
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { END_ID, START_ID, type Direction, type Measure } from "$lib/dfg/types";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";
import type { Simplified } from "$lib/dfg/utils/simplify";

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 58;
/** Start and End are markers rather than boxes, and are drawn as circles. */
export const TERMINAL_SIZE = 36;

export interface Point {
  x: number;
  y: number;
}

export interface Placement {
  /** Top-left corners, by node id. */
  nodes: Map<number, Point>;
  /** SVG path data, by `source->target`. */
  paths: Map<string, string>;
}

const elk = new ELK();
const cache = new Map<string, Placement>();

/** How many layouts to keep. Flipping direction and back should not recompute. */
const CACHE_LIMIT = 12;

export const edgeKey = edgeId;

export const isTerminal = (id: number) => id === START_ID || id === END_ID;

export function nodeSize(id: number): { width: number; height: number } {
  return isTerminal(id)
    ? { width: TERMINAL_SIZE, height: TERMINAL_SIZE }
    : { width: NODE_WIDTH, height: NODE_HEIGHT };
}

/**
 * What the placement depends on and nothing else. Two graphs sharing this key
 * are drawn the same way however differently they are labelled.
 */
export function topologyKey(graph: Simplified, direction: Direction, measure: Measure): string {
  return JSON.stringify([
    direction,
    graph.nodes.map((node) => node.id),
    graph.edges.map((edge) => [edge.source, edge.target, unionCount(edge.counts, measure)])
  ]);
}

/**
 * ELK hands back a start, a run of control points and an end. Three control
 * points make one cubic segment; a leftover tail is a straight line, which is
 * what a two-point edge is anyway.
 */
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

/**
 * A self-loop as a bump on the side the flow leaves free: to the right of the
 * box going down, below it going across.
 */
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

export async function layout(
  graph: Simplified,
  direction: Direction,
  measure: Measure
): Promise<Placement> {
  const key = topologyKey(graph, direction, measure);
  const hit = cache.get(key);
  if (hit) return hit;

  const routed = graph.edges.filter((edge) => edge.source !== edge.target);

  const laid: ElkNode = await elk.layout({
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
      // A DFG is cyclic by nature; this is what turns the back edges around
      // instead of drawing them through the layers. It reads the priorities
      // below, so the edge it turns around is a quiet one.
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
  });

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

  const placement: Placement = { nodes, paths };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, placement);
  return placement;
}

/**
 * Where the simplified graph goes on screen. ELK does the placement and routes
 * the edges around the boxes, which matters here in a way it does not for a
 * tree: a DFG has cycles, and a router that ignores them draws through nodes.
 *
 * Two rules keep this cheap. The box is a fixed size, so adding a figure to a
 * face cannot change the topology. And the layout is handed topology and
 * direction only, never labels or styles, so it is cached by exactly those.
 */
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import type { Direction } from "$lib/dfg/types";
import type { Simplified } from "$lib/dfg/utils/simplify";

export const NODE_WIDTH = 170;
export const NODE_HEIGHT = 64;

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

export const edgeKey = (source: number, target: number) => `${source}->${target}`;

/**
 * What the placement depends on and nothing else. Two graphs sharing this key
 * are drawn the same way however differently they are labelled.
 */
export function topologyKey(graph: Simplified, direction: Direction): string {
  return JSON.stringify([
    direction,
    graph.nodes.map((node) => node.id),
    graph.edges.map((edge) => [edge.source, edge.target])
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

export async function layout(graph: Simplified, direction: Direction): Promise<Placement> {
  const key = topologyKey(graph, direction);
  const hit = cache.get(key);
  if (hit) return hit;

  const laid: ElkNode = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "TB" ? "DOWN" : "RIGHT",
      "elk.edgeRouting": "SPLINES",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "32",
      "elk.spacing.edgeNode": "24",
      // A DFG is cyclic by nature; this is what turns the back edges around
      // instead of drawing them through the layers.
      "elk.layered.cycleBreaking.strategy": "GREEDY"
    },
    children: graph.nodes.map((node) => ({
      id: String(node.id),
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    })),
    edges: graph.edges.map((edge) => ({
      id: edgeKey(edge.source, edge.target),
      sources: [String(edge.source)],
      targets: [String(edge.target)]
    }))
  });

  const placement: Placement = {
    nodes: new Map(
      (laid.children ?? []).map((child) => [Number(child.id), { x: child.x ?? 0, y: child.y ?? 0 }])
    ),
    paths: new Map(
      (laid.edges ?? []).flatMap((edge) => {
        const section = edge.sections?.[0];
        if (!section) return [];
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        return [[edge.id, path(points)] as [string, string]];
      })
    )
  };

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, placement);
  return placement;
}

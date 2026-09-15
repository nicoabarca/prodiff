/**
 * Positions and routes a simplified DFG with Graphviz's `dot` engine, compiled
 * to WASM. A spike alternative to `layout.ts`'s ELK path, same `Placement`
 * shape so the canvas does not know which one drew it.
 *
 * Graphviz's own coordinate system puts the origin at the bottom left with y
 * growing up; every point coming out of it is flipped against the graph's
 * bounding box height before it reaches the rest of the app, which expects
 * screen coordinates throughout.
 */
import { Graphviz } from "@hpcc-js/wasm-graphviz";
import { formatNumber } from "$lib/format";
import { END_ID, START_ID, type Direction, type Measure, type Point } from "$lib/dfg/types";
import { unionCount } from "$lib/dfg/utils/fold";
import {
  edgeKey,
  isTerminal,
  nodeSize,
  selfLoop,
  topologyKey,
  type Placement
} from "$lib/dfg/utils/layout";
import type { Simplified } from "$lib/dfg/utils/simplify";

const PT_PER_IN = 72;
const nodeName = (id: number) => `n${id}`;

let instance: Promise<Graphviz> | null = null;
function loadGraphviz(): Promise<Graphviz> {
  instance ??= Graphviz.load();
  return instance;
}

const escape = (label: string) => label.replace(/"/g, '\\"');

function dotSource(graph: Simplified, direction: Direction, measure: Measure): string {
  const routed = graph.edges.filter((edge) => edge.source !== edge.target);
  const lines = [
    "digraph DFG {",
    `  rankdir=${direction};`,
    `  nodesep=${(90 / PT_PER_IN).toFixed(4)};`,
    `  ranksep=${(80 / PT_PER_IN).toFixed(4)};`
  ];

  for (const node of graph.nodes) {
    const { width, height } = nodeSize(node.id);
    const shape = isTerminal(node.id) ? "circle" : "box";
    lines.push(
      `  ${nodeName(node.id)} [shape=${shape} fixedsize=true width=${(width / PT_PER_IN).toFixed(4)} height=${(height / PT_PER_IN).toFixed(4)} label=""];`
    );
  }
  lines.push(`  { rank=source; ${nodeName(START_ID)}; }`, `  { rank=sink; ${nodeName(END_ID)}; }`);

  for (const edge of routed) {
    const weight = unionCount(edge.counts, measure);
    const label = weight > 0 ? escape(formatNumber(weight)) : "";
    lines.push(
      `  ${nodeName(edge.source)} -> ${nodeName(edge.target)} [label="${label}" weight=${Math.max(1, Math.round(weight))}];`
    );
  }

  lines.push("}");
  return lines.join("\n");
}

interface GvObject {
  _gvid: number;
  name: string;
  pos?: string;
}

interface GvEdge {
  tail: number;
  head: number;
  pos?: string;
}

interface GvGraph {
  bb: string;
  objects?: GvObject[];
  edges?: GvEdge[];
}

const parsePoint = (token: string): Point => {
  const [x, y] = token.split(",").map(Number);
  return { x, y };
};

/** Graphviz's spline `pos` is `[s,sx,sy] cx,cy... [e,ex,ey]`: a cubic Bezier
 * chain, optionally bracketed by the clipped tail/head points. `polyline` in
 * `arrow.ts` already expects exactly that shape: a start point followed by
 * control-point triples. */
function parseSpline(pos: string, flip: (point: Point) => Point): Point[] {
  let start: Point | null = null;
  let end: Point | null = null;
  const controls: Point[] = [];
  for (const token of pos.split(" ")) {
    if (token.startsWith("s,")) start = flip(parsePoint(token.slice(2)));
    else if (token.startsWith("e,")) end = flip(parsePoint(token.slice(2)));
    else controls.push(flip(parsePoint(token)));
  }
  return [...(start ? [start] : []), ...controls, ...(end ? [end] : [])];
}

function placementFromGraphviz(graph: Simplified, gv: GvGraph, direction: Direction): Placement {
  const [, , , bbHeight] = gv.bb.split(",").map(Number);
  const flip = (point: Point): Point => ({ x: point.x, y: bbHeight - point.y });

  const idByGvid = new Map<number, number>();
  const nodes = new Map<number, Point>();
  for (const object of gv.objects ?? []) {
    // The `rank=source`/`rank=sink` subgraphs are objects too, but carry no
    // `pos` of their own: only the actual nodes they hold do.
    if (!object.pos) continue;
    const id = Number(object.name.slice(1));
    idByGvid.set(object._gvid, id);
    const { width, height } = nodeSize(id);
    const center = flip(parsePoint(object.pos));
    nodes.set(id, { x: center.x - width / 2, y: center.y - height / 2 });
  }

  const routes = new Map<string, Point[]>();
  for (const edge of gv.edges ?? []) {
    if (!edge.pos) continue;
    const source = idByGvid.get(edge.tail);
    const target = idByGvid.get(edge.head);
    if (source === undefined || target === undefined) continue;
    routes.set(edgeKey(source, target), parseSpline(edge.pos, flip));
  }

  for (const edge of graph.edges) {
    if (edge.source !== edge.target) continue;
    const corner = nodes.get(edge.source);
    if (corner)
      routes.set(edgeKey(edge.source, edge.target), selfLoop(corner, edge.source, direction));
  }

  return { nodes, routes };
}

const cache = new Map<string, Placement>();
const CACHE_LIMIT = 12;

export async function layoutGraphviz(
  graph: Simplified,
  direction: Direction,
  measure: Measure
): Promise<Placement> {
  const key = topologyKey(graph, direction, measure);
  const hit = cache.get(key);
  if (hit) return hit;

  const graphviz = await loadGraphviz();
  const dot = dotSource(graph, direction, measure);
  const parsed = JSON.parse(graphviz.dot(dot, "json")) as GvGraph;
  const placement = placementFromGraphviz(graph, parsed, direction);

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, placement);
  return placement;
}

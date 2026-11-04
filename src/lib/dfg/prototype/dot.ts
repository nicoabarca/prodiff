/**
 * PROTOTYPE, throwaway. Lays the DFG out the way Celonis Process Explorer does:
 * Graphviz dot in a Web Worker, `rankdir=BT`, `ranksep=0.7`, `nodesep=0.3`,
 * every edge weighted by case count into 1..100 and every edge touching Start
 * or End pinned at 1. Graphviz y grows upward and the result is read as SVG y,
 * so the bottom-to-top layout reads top-down without a flip. Sizes are CSS
 * pixels divided by 72 into inches, so one pixel is one point.
 */
import { isTerminal, nodeSize, type Placement } from "$lib/dfg/utils/layout";
import type { Size } from "$lib/dfg/utils/labels";
import { edgeKey } from "$lib/dfg/utils/layout";
import { unionCount } from "$lib/dfg/utils/fold";
import type { Simplified } from "$lib/dfg/utils/simplify";
import type { Direction, Measure, Point } from "$lib/dfg/types";

interface GvObject {
  _gvid: number;
  name: string;
  pos: string;
}

interface GvEdge {
  tail: number;
  head: number;
  pos: string;
  lp?: string;
}

interface GvJson {
  bb: string;
  objects?: GvObject[];
  edges?: GvEdge[];
}

const worker = new Worker(new URL("./dot.worker.ts", import.meta.url), { type: "module" });
const waiting = new Map<number, (reply: { json?: string; error?: string }) => void>();
let next = 0;
worker.onmessage = (event: MessageEvent<{ id: number; json?: string; error?: string }>) => {
  waiting.get(event.data.id)?.(event.data);
  waiting.delete(event.data.id);
};

function run(dot: string): Promise<string> {
  const id = ++next;
  return new Promise((resolve, reject) => {
    waiting.set(id, (reply) => (reply.json ? resolve(reply.json) : reject(new Error(reply.error))));
    worker.postMessage({ id, dot });
  });
}

const inches = (px: number) => (px / 72).toFixed(3);

// Courier at 10pt is 6pt a character; a line is about 13px.
function labelText(size: Size): string {
  const chars = Math.max(1, Math.ceil(size.width / 6));
  const lines = Math.max(1, Math.round((size.height - 4) / 13));
  return Array.from({ length: lines }, () => "_".repeat(chars)).join("\\n");
}

export function dotSource(
  graph: Simplified,
  direction: Direction,
  measure: Measure,
  labels: Map<string, Size>
): string {
  const heaviest = Math.max(1, ...graph.edges.map((edge) => unionCount(edge.counts, measure)));
  const lines = [
    "digraph G {",
    `rankdir=${direction === "TB" ? "BT" : "LR"}; ranksep=0.7; nodesep=0.3;`,
    'node [shape=box fixedsize=true label=""];',
    'edge [arrowhead=none fontname="Courier" fontsize=10];'
  ];
  for (const node of graph.nodes) {
    const { width, height } = nodeSize(node.id);
    lines.push(`n${node.id} [width=${inches(width)} height=${inches(height)}];`);
  }
  for (const edge of graph.edges) {
    const weight =
      isTerminal(edge.source) || isTerminal(edge.target)
        ? 1
        : Math.floor((unionCount(edge.counts, measure) / heaviest) * 100) + 1;
    const size = labels.get(edgeKey(edge.source, edge.target));
    const label = size ? ` label="${labelText(size)}"` : "";
    lines.push(`n${edge.source} -> n${edge.target} [weight=${weight}${label}];`);
  }
  lines.push("}");
  return lines.join("\n");
}

const point = (text: string): Point => {
  const [x, y] = text.split(",").map(Number);
  return { x, y };
};

export async function dotLayout(
  graph: Simplified,
  direction: Direction,
  measure: Measure,
  labels: Map<string, Size>
): Promise<Placement> {
  const laid = JSON.parse(await run(dotSource(graph, direction, measure, labels))) as GvJson;
  const height = Number(laid.bb.split(",")[3]);
  // Read top-down as is for BT; LR is mirrored so it is not upside down.
  const place = (p: Point): Point => (direction === "TB" ? p : { x: p.x, y: height - p.y });

  const ids = new Map<number, number>();
  const nodes = new Map<number, Point>();
  for (const object of laid.objects ?? []) {
    if (!object.pos) continue;
    const id = Number(object.name.slice(1));
    ids.set(object._gvid, id);
    const centre = place(point(object.pos));
    const { width, height: tall } = nodeSize(id);
    nodes.set(id, { x: centre.x - width / 2, y: centre.y - tall / 2 });
  }

  const routes = new Map<string, Point[]>();
  const labelAt = new Map<string, Point>();
  for (const edge of laid.edges ?? []) {
    const key = edgeKey(ids.get(edge.tail) ?? -1, ids.get(edge.head) ?? -1);
    const points = edge.pos
      .split(" ")
      .filter((token) => !token.startsWith("e,") && !token.startsWith("s,"))
      .map((token) => place(point(token)));
    routes.set(key, points);
    if (edge.lp) labelAt.set(key, place(point(edge.lp)));
  }
  return { nodes, routes, labels: labelAt };
}

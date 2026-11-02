/**
 * PROTOTYPE, throwaway. Our ELK layout with the speed changes taken from the
 * Celonis notes and the benchmark: crossing minimization ignores the input
 * order (`considerModelOrder: NONE`, the bulk of the time on big graphs), each
 * edge's straightness weighs its case count into 1..100 with Start and End
 * pinned at 1, ELK runs in a Web Worker so the window never freezes, edge
 * labels stop reserving room past `LABELS_UP_TO` edges (a label is still drawn,
 * on its edge's line), and the cache key only carries label sizes when they
 * enter the layout, so toggling Waiting Time on a big graph re-runs nothing.
 */
import ELK from "elkjs/lib/elk-api.js";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import {
  edgeKey,
  elkGraph,
  isTerminal,
  placementFromElk,
  topologyKey,
  type Placement
} from "$lib/dfg/utils/layout";
import { unionCount } from "$lib/dfg/utils/fold";
import type { Size } from "$lib/dfg/utils/labels";
import type { Simplified } from "$lib/dfg/utils/simplify";
import type { Direction, Measure } from "$lib/dfg/types";

const LABELS_UP_TO = 100;

const OPTIONS: Record<string, string> = {
  "elk.layered.considerModelOrder.strategy": "NONE"
};

const elk = new ELK({ workerFactory: () => new Worker(elkWorkerUrl) });
const cache = new Map<string, Placement>();
const NO_LABELS = new Map<string, Size>();

export const labelsInLayout = (edges: number) => edges <= LABELS_UP_TO;

export async function elkFastLayout(
  graph: Simplified,
  direction: Direction,
  measure: Measure,
  labels: Map<string, Size>
): Promise<{ placement: Placement; cached: boolean }> {
  const reserved = labelsInLayout(graph.edges.length) ? labels : NO_LABELS;
  const key = topologyKey(graph, direction, measure, reserved);
  const hit = cache.get(key);
  if (hit) return { placement: withSelfLoopLabels(hit, graph, direction, labels), cached: true };

  const input = elkGraph(graph, direction, measure, reserved);
  input.layoutOptions = { ...input.layoutOptions, ...OPTIONS };
  const heaviest = Math.max(1, ...graph.edges.map((edge) => unionCount(edge.counts, measure)));
  const weights = new Map(
    graph.edges.map((edge) => [
      edgeKey(edge.source, edge.target),
      isTerminal(edge.source) || isTerminal(edge.target)
        ? 1
        : Math.floor((unionCount(edge.counts, measure) / heaviest) * 100) + 1
    ])
  );
  for (const edge of input.edges ?? []) {
    edge.layoutOptions = {
      "elk.layered.priority.straightness": String(weights.get(edge.id) ?? 1)
    };
  }
  const placement = placementFromElk(graph, await elk.layout(input), direction, reserved);
  if (cache.size >= 12) cache.delete(cache.keys().next().value as string);
  cache.set(key, placement);
  return { placement: withSelfLoopLabels(placement, graph, direction, labels), cached: false };
}

/** Self-loop labels sit beside the loop and never enter ELK, so they are placed for every label shown. */
function withSelfLoopLabels(
  placement: Placement,
  graph: Simplified,
  direction: Direction,
  labels: Map<string, Size>
): Placement {
  if (labels.size === 0) return placement;
  const fresh = placementFromElk(
    { ...graph, edges: graph.edges.filter((edge) => edge.source === edge.target) },
    { children: [...placement.nodes].map(([id, at]) => ({ id: String(id), ...at })) } as never,
    direction,
    labels
  );
  return { ...placement, labels: new Map([...placement.labels, ...fresh.labels]) };
}

/**
 * PROTOTYPE, throwaway. Runs the layout engine the switcher picked and records
 * how long it took. Every engine places every node and edge it is handed; only
 * the geometry differs.
 */
import { layout, type Placement } from "$lib/dfg/utils/layout";
import type { Size } from "$lib/dfg/utils/labels";
import type { Simplified } from "$lib/dfg/utils/simplify";
import type { Direction, Measure } from "$lib/dfg/types";
import { dotLayout } from "$lib/dfg/prototype/dot";
import { elkFastLayout, labelsInLayout } from "$lib/dfg/prototype/elk-fast";
import { prototype, run, type Engine } from "$lib/dfg/prototype/engine.svelte";
import { clearLayoutCache } from "$lib/dfg/utils/layout";
import { clearElkFastCache } from "$lib/dfg/prototype/elk-fast";

const cache = new Map<string, Placement>();

export function clearAllLayoutCaches() {
  cache.clear();
  clearLayoutCache();
  clearElkFastCache();
}

export async function prototypeLayout(
  engine: Engine,
  graph: Simplified,
  direction: Direction,
  measure: Measure,
  labels: Map<string, Size>
): Promise<Placement> {
  const started = performance.now();
  run.layoutStart = started;
  run.layoutDone = null;
  run.painted = null;
  let placement: Placement;
  let cached = false;
  if (engine === "elk") {
    placement = await layout(graph, direction, measure, labels);
  } else if (engine === "elk-fast" || engine === "elk-layered") {
    ({ placement, cached } = await elkFastLayout(
      graph,
      direction,
      measure,
      labels,
      engine === "elk-layered"
    ));
  } else {
    const key = JSON.stringify([
      direction,
      graph.nodes.map((node) => node.id),
      graph.edges.map((edge) => [edge.source, edge.target, edge.counts]),
      [...labels]
    ]);
    const hit = cache.get(key);
    cached = hit !== undefined;
    placement = hit ?? (await dotLayout(graph, direction, measure, labels));
    if (!hit) cache.set(key, placement);
  }
  const ms = Math.round(performance.now() - started);
  run.layoutDone = performance.now();
  Object.assign(prototype, {
    ms,
    cached: cached || (engine === "elk" && ms < 5),
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    labelsInLayout:
      labels.size > 0 &&
      (engine === "elk" || engine === "dot" || labelsInLayout(graph.edges.length))
  });
  return placement;
}

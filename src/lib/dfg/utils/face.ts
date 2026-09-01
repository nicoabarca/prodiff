/**
 * What a node or an edge prints on its face, and how thick an edge is drawn.
 * Everything here reads figures already in hand, so changing a measure never
 * touches the backend and never moves a box.
 */
import { formatDuration, formatNumber } from "$lib/format";
import type { Counts, DfgEdge, DfgNode } from "$lib/dfg/invokers/types";
import type { FaceGroup, Measure } from "$lib/dfg/types";
import type { SimplifiedEdge } from "$lib/dfg/utils/simplify";

const measured = (counts: Record<string, Counts>, id: string, measure: Measure): number | null => {
  const found = counts[id];
  if (!found) return null;
  return measure === "cases" ? found.cases : found.events;
};

/**
 * One entry per Group, in the order they are compared, so each can be printed
 * in its own colour. `null` where that Group never reached here.
 */
export function faceCounts(
  counts: Record<string, Counts>,
  groups: FaceGroup[],
  measure: Measure
): (string | null)[] {
  return groups.map((group) => {
    const value = measured(counts, group.id, measure);
    return value === null || value === 0 ? null : formatNumber(value);
  });
}

/** The union across the Groups, which is what edge thickness is scaled against. */
export function unionCount(counts: Record<string, Counts>, measure: Measure): number {
  return Object.values(counts).reduce(
    (total, count) => total + (measure === "cases" ? count.cases : count.events),
    0
  );
}

/**
 * Edge thickness, between 0.5 and 5.5, scaled against the busiest edge drawn. A
 * reconnection has no figures at all and is drawn at the thinnest.
 */
export function edgeWidth(edge: DfgEdge | null, busiest: number, measure: Measure): number {
  if (!edge || busiest <= 0) return 0.5;
  return 0.5 + (unionCount(edge.counts, measure) / busiest) * 5;
}

/**
 * The mean wait on an edge, per Group. Empty unless Transition Time was one of
 * the attributes asked for, and always empty on a Start or End edge.
 */
export function edgeWait(edge: DfgEdge | null, groups: FaceGroup[]): string | null {
  const block = edge?.transitionTime;
  if (!block) return null;
  const parts = groups
    .map((group) => {
      const summary = block.summaries[group.id];
      return summary?.type === "numerical" ? formatDuration(summary.mean) : null;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** How many of a node's attributes came back a significant difference. */
export function findings(node: DfgNode): number {
  return Object.values(node.attributes).filter((block) => block.test?.significant).length;
}

/** The busiest edge on screen, for scaling every other one against. */
export function busiestEdge(edges: SimplifiedEdge[], measure: Measure): number {
  return edges.reduce(
    (top, edge) => Math.max(top, edge.edge ? unionCount(edge.edge.counts, measure) : 0),
    0
  );
}

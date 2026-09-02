/**
 * What a node or an edge prints on its face, and how thick an edge is drawn.
 * Everything here reads figures already in hand, so changing a measure never
 * touches the backend and never moves a box.
 */
import { formatDuration, formatNumber } from "$lib/format";
import type { AttributeBlock } from "$lib/analysis/types";
import type { Counts, DfgNode, ResponseDfg } from "$lib/dfg/invokers/types";
import type { FaceGroup, Measure } from "$lib/dfg/types";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";

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
    const value = counts[group.id]?.[measure] ?? 0;
    return value === 0 ? null : formatNumber(value);
  });
}

/** Edge thickness, between 0.5 and 5.5, scaled against the busiest edge drawn. */
export function edgeWidth(
  counts: Record<string, Counts>,
  busiest: number,
  measure: Measure
): number {
  if (busiest <= 0) return 0.5;
  return 0.5 + (unionCount(counts, measure) / busiest) * 5;
}

/** How dark a box is drawn, against the busiest activity on screen. */
export function nodeShare(
  counts: Record<string, Counts>,
  busiest: number,
  measure: Measure
): number {
  if (busiest <= 0) return 0;
  return Math.min(1, unionCount(counts, measure) / busiest);
}

/**
 * The waits Rust measured, by `source->target`. Only pairs the log holds have
 * one, and only when Transition Time was among the attributes asked for, so a
 * pair that only exists because an activity is hidden is absent by design.
 */
export function transitionsById(graph: ResponseDfg): Map<string, AttributeBlock> {
  return new Map(
    graph.transitions.map((transition) => [
      edgeId(transition.source, transition.target),
      transition.wait
    ])
  );
}

/** The mean wait on an edge, per Group. */
export function edgeWait(wait: AttributeBlock | undefined, groups: FaceGroup[]): string | null {
  if (!wait) return null;
  const parts = groups
    .map((group) => {
      const summary = wait.summaries[group.id];
      return summary?.type === "numerical" ? formatDuration(summary.mean) : null;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** How many of a node's attributes came back a significant difference. */
export function findings(node: DfgNode | undefined): number {
  if (!node) return 0;
  return Object.values(node.attributes).filter((block) => block.test?.significant).length;
}

/** The busiest of a set, for scaling every other one against. */
export function busiest(of: { counts: Record<string, Counts> }[], measure: Measure): number {
  return of.reduce((top, one) => Math.max(top, unionCount(one.counts, measure)), 0);
}

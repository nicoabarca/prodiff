/**
 * The Behaviour and Paths sliders on the canvas. Behaviour picks the Variants
 * the graph is built from; Paths hides the rarer edges of the graph built.
 */
import { END_ID, START_ID, type Measure } from "$lib/dfg/types";
import { unionCount, type FoldedEdge } from "$lib/dfg/utils/fold";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";
import { variantCases, variantsCovering } from "$lib/tree/utils/variants";

const isBoundary = (edge: FoldedEdge) => edge.source === START_ID || edge.target === END_ID;

/** Edges between two activities: the ones the Paths cut can hide. */
export const innerEdges = (edges: FoldedEdge[]) => edges.filter((edge) => !isBoundary(edge));

/**
 * The coverage, in percent, that stages one Variant more (`step` 1) or one
 * fewer (`step` -1) than `coverage` stages. It sits just under the cumulative
 * share of that many Variants, so `variantsCovering` lands on exactly them.
 * `rows` is in `list_variants` order, biggest first.
 */
export function stepCoverage(rows: ResponseVariantRow[], coverage: number, step: 1 | -1): number {
  const total = rows.reduce((sum, row) => sum + variantCases(row), 0);
  if (total === 0) return coverage;
  const count = variantsCovering(rows, coverage / 100).size;
  const wanted = Math.min(rows.length, Math.max(1, count + step));
  const held = rows.slice(0, wanted).reduce((sum, row) => sum + variantCases(row), 0);
  return Math.min(100, ((held - 0.5) / total) * 100);
}

/**
 * The Paths share, in percent, nearest to `paths` in the direction of `step`
 * that draws a different number of edges, or `paths` itself when none does.
 */
export function stepPaths(
  edges: FoldedEdge[],
  groups: string[],
  paths: number,
  measure: Measure,
  step: 1 | -1
): number {
  const drawn = cutPaths(edges, groups, paths / 100, measure).length;
  for (let next = Math.round(paths) + step; next >= 0 && next <= 100; next += step) {
    if (cutPaths(edges, groups, next / 100, measure).length !== drawn) return next;
  }
  return paths;
}

/**
 * Each Group's busiest `share` of the edges between activities, plus every
 * activity's busiest way in and way out, so no activity is left unconnected.
 * Edges from Start and into End are always kept.
 */
export function cutPaths(
  edges: FoldedEdge[],
  groups: string[],
  share: number,
  measure: Measure
): FoldedEdge[] {
  const inner = innerEdges(edges);
  const preserved = new Set<FoldedEdge>(edges.filter(isBoundary));
  const wanted =
    inner.length === 0 ? 0 : Math.min(inner.length, Math.max(1, Math.ceil(share * inner.length)));

  for (const group of groups) {
    const ofGroup = inner
      .filter((edge) => (edge.counts[group]?.[measure] ?? 0) > 0)
      .sort((a, b) => (b.counts[group]?.[measure] ?? 0) - (a.counts[group]?.[measure] ?? 0));
    for (const edge of ofGroup.slice(0, wanted)) preserved.add(edge);
  }

  const best = (of: FoldedEdge[]) =>
    of.reduce<FoldedEdge | null>(
      (top, edge) =>
        !top || unionCount(edge.counts, measure) > unionCount(top.counts, measure) ? edge : top,
      null
    );
  const push = (into: Map<number, FoldedEdge[]>, node: number, edge: FoldedEdge) => {
    const found = into.get(node);
    if (found) found.push(edge);
    else into.set(node, [edge]);
  };
  const incomingByNode = new Map<number, FoldedEdge[]>();
  const outgoingByNode = new Map<number, FoldedEdge[]>();
  for (const edge of inner) {
    push(incomingByNode, edge.target, edge);
    push(outgoingByNode, edge.source, edge);
  }
  for (const edges of [...incomingByNode.values(), ...outgoingByNode.values()]) {
    const winner = best(edges);
    if (winner) preserved.add(winner);
  }

  return edges.filter((edge) => preserved.has(edge));
}

/**
 * The Behaviour and Paths sliders of the Variants panel. Both stage whole
 * Variants, so the build Apply asks for describes exactly what the graph draws.
 */
import type { Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, type Measure } from "$lib/dfg/types";
import { edgeId, fold, unionCount, variantEdgeIds, type FoldedEdge } from "$lib/dfg/utils/fold";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";
import { variantsCovering } from "$lib/tree/utils/variants";

/** What a set of Variants would draw: its activities and its paths. */
export interface Shape {
  activities: number;
  paths: number;
}

const isBoundary = (edge: FoldedEdge) => edge.source === START_ID || edge.target === END_ID;

/**
 * Rows numbered the way the graph numbers activities, Start and End first.
 * The numbers are local to the call: they only tell one activity from another.
 */
function numbered(rows: ResponseVariantRow[]): Variant[] {
  const ids = new Map<string, number>();
  const idOf = (label: string) => {
    let id = ids.get(label);
    if (id === undefined) {
      id = END_ID + 1 + ids.size;
      ids.set(label, id);
    }
    return id;
  };
  return rows.map((row) => ({ activities: row.activities.map(idOf), cases: row.cases }));
}

/**
 * The most common Variants up to `coverage` of the cases, less every one that
 * runs a transition the Paths cut drops. `rows` is in `list_variants` order,
 * biggest first. At least one Variant survives, since an empty selection
 * cannot be applied.
 */
export function cutVariants(
  rows: ResponseVariantRow[],
  coverage: number,
  paths: number,
  groups: string[],
  measure: Measure
): Set<string> {
  const covered = variantsCovering(rows, coverage);
  const base = rows.filter((row) => covered.has(row.key));
  const variants = numbered(base);
  const kept = new Set(
    cutPaths(fold(variants).edges, groups, paths, measure).map((edge) =>
      edgeId(edge.source, edge.target)
    )
  );
  const whole = base.filter((_, i) =>
    [...variantEdgeIds(variants[i].activities)].every((id) => kept.has(id))
  );
  return new Set((whole.length > 0 ? whole : base.slice(0, 1)).map((row) => row.key));
}

export function shapeOf(rows: ResponseVariantRow[]): Shape {
  const folded = fold(numbered(rows));
  return {
    activities: [...folded.nodes.keys()].filter((id) => id !== START_ID && id !== END_ID).length,
    paths: folded.edges.length
  };
}

/** Keeps each Group's busiest paths and every activity's busiest connections. */
function cutPaths(
  edges: FoldedEdge[],
  groups: string[],
  share: number,
  measure: Measure
): FoldedEdge[] {
  const inner = edges.filter((edge) => !isBoundary(edge));
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

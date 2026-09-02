/**
 * What the two sliders leave on screen, run once over the union of the Groups
 * so both sides see one graph.
 *
 * Activities first: the least travelled ones are dropped and the variants are
 * folded again without them, so the paths that appear in their place carry real
 * counts. Then the paths, ranked inside each Group rather than across them, so
 * a Group with fewer cases is not drowned by a larger one. Start and End edges
 * are structure and are never cut, and every activity keeps its busiest way in
 * and its busiest way out, which is what stops the graph coming apart.
 */
import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, type DfgView, type Measure, type NodeKind } from "$lib/dfg/types";
import { fold, unionCount, type FoldedEdge } from "$lib/dfg/utils/fold";

export interface SimplifiedNode {
  id: number;
  label: string;
  kind: NodeKind;
  counts: Record<string, Counts>;
}

export interface Simplified {
  nodes: SimplifiedNode[];
  edges: FoldedEdge[];
  activities: { shown: number; total: number };
  paths: { shown: number; total: number };
}

const isBoundary = (edge: FoldedEdge) => edge.source === START_ID || edge.target === END_ID;

/** How many of `total` a slider at `share` keeps. Never none, never a fraction. */
function keepCount(total: number, share: number): number {
  if (total === 0) return 0;
  return Math.min(total, Math.max(1, Math.ceil(share * total)));
}

export function simplify(graph: ResponseDfg, view: DfgView): Simplified {
  const measure = view.measure;

  const ranked = [...graph.nodes].sort(
    (a, b) =>
      unionCount(b.counts, measure) - unionCount(a.counts, measure) ||
      a.label.localeCompare(b.label)
  );
  const kept = new Set(ranked.slice(0, keepCount(ranked.length, view.activities)).map((n) => n.id));

  const folded = fold(graph.variants, kept);
  const edges = cutPaths(
    folded.edges,
    graph.groups.map((group) => group.id),
    view.paths,
    measure
  );

  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const nodes: SimplifiedNode[] = [...folded.nodes.entries()]
    .map(([id, counts]) => ({
      id,
      label: id === START_ID ? "Start" : id === END_ID ? "End" : (labels.get(id) ?? String(id)),
      kind: (id === START_ID ? "start" : id === END_ID ? "end" : "activity") as NodeKind,
      counts
    }))
    .sort((a, b) => a.id - b.id);

  return {
    nodes,
    edges,
    activities: { shown: kept.size, total: graph.nodes.length },
    paths: { shown: edges.length, total: folded.edges.length }
  };
}

/**
 * Top-N inside each Group, then the union of those, then the guarantee. Ranking
 * across the Groups instead would let the larger one decide the whole picture.
 */
function cutPaths(
  edges: FoldedEdge[],
  groups: string[],
  share: number,
  measure: Measure
): FoldedEdge[] {
  const inner = edges.filter((edge) => !isBoundary(edge));
  const preserved = new Set<FoldedEdge>(edges.filter(isBoundary));
  const wanted = keepCount(inner.length, share);

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
  for (const node of new Set(inner.flatMap((edge) => [edge.source, edge.target]))) {
    const incoming = best(inner.filter((edge) => edge.target === node));
    const outgoing = best(inner.filter((edge) => edge.source === node));
    if (incoming) preserved.add(incoming);
    if (outgoing) preserved.add(outgoing);
  }

  return edges.filter((edge) => preserved.has(edge));
}

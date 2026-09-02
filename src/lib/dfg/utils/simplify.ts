/**
 * What the two sliders leave on screen, run once over the union of the Groups
 * so both sides see one graph.
 *
 * The first slider chooses behaviour: the trace shapes are taken in order of
 * how many cases ran them until the chosen share of the log is covered, and the
 * graph is the directly-follows graph of exactly those cases. Every edge drawn
 * therefore happened, in that order, in a case being counted, and no activity
 * is ever an ending the log does not give it. A shape enters whole, which is
 * why raising the slider adds a run of activities at once rather than one.
 *
 * The second slider then thins the paths, ranked inside each Group rather than
 * across them, so a Group with fewer cases is not drowned by a larger one. Start
 * and End edges are never cut, and every activity keeps its busiest way in and
 * its busiest way out, which is what stops the graph coming apart.
 */
import type { Counts, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
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
  /** `cases` of `totalCases` is the share of the log the drawing accounts for. */
  variants: { shown: number; total: number; cases: number; totalCases: number };
  activities: { shown: number; total: number };
  paths: { shown: number; total: number };
}

const isBoundary = (edge: FoldedEdge) => edge.source === START_ID || edge.target === END_ID;

const variantCases = (variant: Variant): number =>
  Object.values(variant.cases).reduce((total, cases) => total + cases, 0);

export function simplify(graph: ResponseDfg, view: DfgView): Simplified {
  const ids = graph.groups.map((group) => group.id);
  const { chosen, cases, totalCases } = chooseVariants(graph.variants, view.coverage);

  const folded = fold(chosen);
  const edges = cutPaths(folded.edges, ids, view.paths, view.measure);

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
    variants: { shown: chosen.length, total: graph.variants.length, cases, totalCases },
    activities: {
      shown: nodes.filter((node) => node.kind === "activity").length,
      total: graph.nodes.length
    },
    paths: { shown: edges.length, total: folded.edges.length }
  };
}

/**
 * The most travelled shapes, taken whole until they account for `coverage` of
 * the cases. Never none: at the bottom of the slider the graph is the single
 * route the log takes most often.
 */
function chooseVariants(
  variants: Variant[],
  coverage: number
): { chosen: Variant[]; cases: number; totalCases: number } {
  const ordered = [...variants].sort(
    (a, b) => variantCases(b) - variantCases(a) || a.activities.length - b.activities.length
  );
  const totalCases = ordered.reduce((total, variant) => total + variantCases(variant), 0);
  const wanted = coverage * totalCases;

  const chosen: Variant[] = [];
  let cases = 0;
  for (const variant of ordered) {
    if (chosen.length > 0 && cases >= wanted) break;
    chosen.push(variant);
    cases += variantCases(variant);
  }
  return { chosen, cases, totalCases };
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
  for (const node of new Set(inner.flatMap((edge) => [edge.source, edge.target]))) {
    const incoming = best(inner.filter((edge) => edge.target === node));
    const outgoing = best(inner.filter((edge) => edge.source === node));
    if (incoming) preserved.add(incoming);
    if (outgoing) preserved.add(outgoing);
  }

  return edges.filter((edge) => preserved.has(edge));
}

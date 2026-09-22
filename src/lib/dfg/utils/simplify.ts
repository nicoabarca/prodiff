/** Simplifies DFG variants and paths for display. */
import type { Counts, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, type DfgView, type Measure, type NodeKind } from "$lib/dfg/types";
import { fold, unionCount, variantKey, type FoldedEdge } from "$lib/dfg/utils/fold";

export interface SimplifiedNode {
  id: number;
  label: string;
  kind: NodeKind;
  counts: Record<string, Counts>;
}

export interface Simplified {
  nodes: SimplifiedNode[];
  edges: FoldedEdge[];
  variants: {
    shown: number;
    total: number;
    cases: number;
    totalCases: number;
    /** Keys of the Variants the Behaviour cut kept, for the picker to mark
        which rows are actually drawn. */
    keys: Set<string>;
  };
  activities: { shown: number; total: number };
  paths: { shown: number; total: number };
}

const isBoundary = (edge: FoldedEdge) => edge.source === START_ID || edge.target === END_ID;

const variantCases = (variant: Variant): number =>
  Object.values(variant.cases).reduce((total, cases) => total + cases, 0);

export function simplify(graph: ResponseDfg, view: DfgView): Simplified {
  const ids = graph.groups.map((group) => group.id);
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const { chosen, cases, totalCases } = chooseVariants(graph.variants, view.coverage);

  const folded = fold(chosen);
  const edges = cutPaths(folded.edges, ids, view.paths, view.measure);

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
    variants: {
      shown: chosen.length,
      total: graph.variants.length,
      cases,
      totalCases,
      keys: new Set(chosen.map((variant) => variantKey(variant.activities, labels)))
    },
    activities: {
      shown: nodes.filter((node) => node.kind === "activity").length,
      total: graph.nodes.length
    },
    paths: { shown: edges.length, total: folded.edges.length }
  };
}

/** Chooses whole trace shapes up to the requested case coverage. */
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

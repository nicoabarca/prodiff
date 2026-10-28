/**
 * The built graph folded into what the canvas draws. Every Variant the graph
 * was built from is drawn: the cut happens in the Variants panel, before the
 * build, so nothing on screen goes untested and no test describes a case off it.
 */
import type { Counts, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, type NodeKind } from "$lib/dfg/types";
import { fold, variantKey, type FoldedEdge } from "$lib/dfg/utils/fold";

export interface SimplifiedNode {
  id: number;
  label: string;
  kind: NodeKind;
  counts: Record<string, Counts>;
}

/** `variants.keys` are the rows the picker marks as on the graph and whose eye can light them. */
export interface Simplified {
  nodes: SimplifiedNode[];
  edges: FoldedEdge[];
  variants: {
    count: number;
    cases: number;
    keys: Set<string>;
  };
}

const variantCases = (variant: Variant): number =>
  Object.values(variant.cases).reduce((total, cases) => total + cases, 0);

export function simplify(graph: ResponseDfg): Simplified {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const folded = fold(graph.variants);

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
    edges: folded.edges,
    variants: {
      count: graph.variants.length,
      cases: graph.variants.reduce((total, variant) => total + variantCases(variant), 0),
      keys: new Set(graph.variants.map((variant) => variantKey(variant.activities, labels)))
    }
  };
}

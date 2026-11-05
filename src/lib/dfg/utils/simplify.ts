/**
 * The built graph folded into what the canvas draws. Every Variant the graph
 * was built from is drawn; the Paths cut then hides the rarer edges between
 * activities, which never adds an edge the log does not hold.
 */
import type { Counts, ResponseDfg, Variant } from "$lib/dfg/invokers/types";
import { END_ID, START_ID, type Measure, type NodeKind } from "$lib/dfg/types";
import { cutPaths, innerEdges } from "$lib/dfg/utils/cut";
import { edgeId, fold, variantKey, type FoldedEdge, type LitPath } from "$lib/dfg/utils/fold";

export interface SimplifiedNode {
  id: number;
  label: string;
  kind: NodeKind;
  counts: Record<string, Counts>;
}

/**
 * `variants.keys` are the rows the picker marks as on the graph and whose eye
 * can light them. `folded` is every edge the Variants run, `hidden` how many
 * of them the Paths cut leaves out of `edges`.
 */
export interface Simplified {
  nodes: SimplifiedNode[];
  edges: FoldedEdge[];
  folded: FoldedEdge[];
  hidden: number;
  variants: {
    count: number;
    cases: number;
    keys: Set<string>;
  };
}

/** Where the Paths slider sits: the share of edges kept, the Groups each keeps its own busiest for, and what ranks them. */
export interface PathsCut {
  share: number;
  groups: string[];
  measure: Measure;
}

const variantCases = (variant: Variant): number =>
  Object.values(variant.cases).reduce((total, cases) => total + cases, 0);

export function simplify(graph: ResponseDfg, paths: PathsCut | null = null): Simplified {
  const labels = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const folded = fold(graph.variants);
  const edges = paths
    ? cutPaths(folded.edges, paths.groups, paths.share, paths.measure)
    : folded.edges;

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
    folded: folded.edges,
    hidden: innerEdges(folded.edges).length - innerEdges(edges).length,
    variants: {
      count: graph.variants.length,
      cases: graph.variants.reduce((total, variant) => total + variantCases(variant), 0),
      keys: new Set(graph.variants.map((variant) => variantKey(variant.activities, labels)))
    }
  };
}

/** The nodes and edges `after` draws that `before` did not, in canvas ids. */
export function addedSince(before: Simplified, after: Simplified): LitPath {
  const nodes = new Set(before.nodes.map((node) => node.id));
  const edges = new Set(before.edges.map((edge) => edgeId(edge.source, edge.target)));
  return {
    nodes: new Set(
      after.nodes.filter((node) => !nodes.has(node.id)).map((node) => String(node.id))
    ),
    edges: new Set(
      after.edges.map((edge) => edgeId(edge.source, edge.target)).filter((id) => !edges.has(id))
    )
  };
}

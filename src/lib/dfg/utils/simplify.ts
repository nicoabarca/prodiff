/**
 * The Fuzzy Miner simplification, run once over the union of the Groups so both
 * sides see one graph.
 *
 * Three stages in this order: conflicting pairs, then the edge cutoff, then the
 * node cutoff. The second is what keeps the graph in one piece, and it is not a
 * top-N: each node ranks its own edges, so every node keeps its best way in and
 * its best way out no matter how high the cutoff goes.
 */
import type { DfgEdge, DfgNode, ResponseDfg } from "$lib/dfg/invokers/types";
import { PRESERVE_THRESHOLD, RATIO_THRESHOLD, type DfgView } from "$lib/dfg/types";

export interface SimplifiedEdge {
  source: number;
  target: number;
  /**
   * The edge Rust measured, or `null` when this one stands in for a removed
   * node: that pair never occurred directly in the log, so it has no figures.
   */
  edge: DfgEdge | null;
}

export interface Simplified {
  nodes: DfgNode[];
  edges: SimplifiedEdge[];
}

const pairKey = (source: number, target: number) => `${source}->${target}`;

export function simplify(graph: ResponseDfg, view: DfgView): Simplified {
  const resolved = resolveConflicts(graph.edges);
  const cut = applyEdgeCutoff(resolved, view.utilityRatio, view.edgeCutoff);
  return applyNodeCutoff(graph.nodes, cut, view.nodeCutoff);
}

/**
 * Relative significance: half of how much of its source's outgoing weight an
 * edge carries, half of how much of its target's incoming weight.
 */
function relativeSignificance(edges: DfgEdge[]): Map<string, number> {
  const outgoing = new Map<number, number>();
  const incoming = new Map<number, number>();
  for (const edge of edges) {
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + edge.significance);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + edge.significance);
  }
  const share = (value: number, total: number | undefined) =>
    total && total > 0 ? value / total : 0;

  return new Map(
    edges.map((edge) => [
      pairKey(edge.source, edge.target),
      0.5 * share(edge.significance, outgoing.get(edge.source)) +
        0.5 * share(edge.significance, incoming.get(edge.target))
    ])
  );
}

/**
 * Stage one. A pair with an edge each way is either a real length-two loop, one
 * direction plus its noise, or two activities that simply happen in either
 * order. Only the first is drawn as written.
 */
function resolveConflicts(edges: DfgEdge[]): DfgEdge[] {
  const relative = relativeSignificance(edges);
  const present = new Set(edges.map((edge) => pairKey(edge.source, edge.target)));
  const dropped = new Set<string>();

  for (const edge of edges) {
    // A self-loop has no opposite to conflict with, and each pair is judged
    // once, from its lower-numbered end.
    if (edge.source >= edge.target) continue;
    const forwardKey = pairKey(edge.source, edge.target);
    const backKey = pairKey(edge.target, edge.source);
    if (!present.has(backKey)) continue;

    const forward = relative.get(forwardKey) ?? 0;
    const back = relative.get(backKey) ?? 0;
    if (forward > PRESERVE_THRESHOLD && back > PRESERVE_THRESHOLD) continue;
    if (Math.abs(forward - back) > RATIO_THRESHOLD) {
      dropped.add(forward >= back ? backKey : forwardKey);
      continue;
    }
    dropped.add(forwardKey);
    dropped.add(backKey);
  }

  return edges.filter((edge) => !dropped.has(pairKey(edge.source, edge.target)));
}

/**
 * Stage two. Every node normalizes the utility of its own incoming edges to
 * `[0, 1]` and keeps the ones at or above the cutoff, then does the same with
 * its outgoing ones. An edge survives if either end kept it.
 */
function applyEdgeCutoff(edges: DfgEdge[], ratio: number, cutoff: number): DfgEdge[] {
  const utility = new Map<DfgEdge, number>(
    edges.map((edge) => [edge, ratio * edge.significance + (1 - ratio) * edge.correlation])
  );
  const preserved = new Set<DfgEdge>();

  const rank = (endpoint: (edge: DfgEdge) => number) => {
    const byNode = new Map<number, DfgEdge[]>();
    for (const edge of edges) {
      const node = endpoint(edge);
      const found = byNode.get(node);
      if (found) found.push(edge);
      else byNode.set(node, [edge]);
    }
    for (const group of byNode.values()) {
      const values = group.map((edge) => utility.get(edge) ?? 0);
      const low = values.reduce((a, b) => Math.min(a, b));
      const high = values.reduce((a, b) => Math.max(a, b));
      const span = high - low;
      group.forEach((edge, i) => {
        // One edge, or a tie, normalizes to 1. That is the guarantee: a node
        // never loses its best edge, so the graph never comes apart.
        const normalized = span > 0 ? (values[i] - low) / span : 1;
        if (normalized >= cutoff) preserved.add(edge);
      });
    }
  };
  rank((edge) => edge.target);
  rank((edge) => edge.source);

  return edges.filter((edge) => preserved.has(edge));
}

/**
 * Stage three. A node under the cutoff is removed and each of its predecessors
 * wired to each of its successors, so the flow through it survives its label.
 * Start and End are structure, not behaviour, and are never removed.
 */
function applyNodeCutoff(nodes: DfgNode[], edges: DfgEdge[], cutoff: number): Simplified {
  let surviving: SimplifiedEdge[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    edge
  }));

  const removable = nodes
    .filter((node) => node.kind === "activity" && node.significance < cutoff)
    .sort((a, b) => a.significance - b.significance);
  const removed = new Set<number>();

  for (const node of removable) {
    removed.add(node.id);
    const ends = (from: (edge: SimplifiedEdge) => number, to: (edge: SimplifiedEdge) => number) => [
      ...new Set(
        surviving.filter((edge) => to(edge) === node.id && from(edge) !== node.id).map(from)
      )
    ];
    const predecessors = ends(
      (edge) => edge.source,
      (edge) => edge.target
    );
    const successors = ends(
      (edge) => edge.target,
      (edge) => edge.source
    );

    surviving = surviving.filter((edge) => edge.source !== node.id && edge.target !== node.id);
    const present = new Set(surviving.map((edge) => pairKey(edge.source, edge.target)));
    for (const source of predecessors) {
      for (const target of successors) {
        // Wiring a predecessor back to itself would invent a self-loop the log
        // never had.
        if (source === target) continue;
        const key = pairKey(source, target);
        if (present.has(key)) continue;
        present.add(key);
        surviving.push({ source, target, edge: null });
      }
    }
  }

  surviving.sort((a, b) => a.source - b.source || a.target - b.target);
  return { nodes: nodes.filter((node) => !removed.has(node.id)), edges: surviving };
}

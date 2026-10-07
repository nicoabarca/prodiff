import type { DfgNode, ResponseDfg, Transition } from "$lib/dfg/invokers/types";
import type { Simplified } from "$lib/dfg/utils/simplify";

/** A selected activity with the measured transitions into and out of it. */
export interface InspectedNode {
  node: DfgNode;
  incoming: Transition[];
  outgoing: Transition[];
}

/** The selected activity as Rust shipped it; null for no selection, Start or End. */
export function findNode(graph: ResponseDfg, id: number | null): InspectedNode | null {
  if (id === null) return null;
  const node = graph.nodes.find((candidate) => candidate.id === id);
  if (!node) return null;
  return {
    node,
    incoming: graph.transitions.filter((transition) => transition.target === id),
    outgoing: graph.transitions.filter((transition) => transition.source === id)
  };
}

/** One-line header for the inspector: payload sizes, compared Group ids, build key. */
export function dfgSummary(graph: ResponseDfg, key: string | null): string {
  const groups = graph.groups.map((group) => group.id).join(", ");
  return [
    `${graph.nodes.length} nodes`,
    `${graph.variants.length} variants`,
    `${graph.transitions.length} transitions`,
    `groups: ${groups}`,
    `key: ${key ?? "none"}`
  ].join(" · ");
}

/** The simplified graph with its Set of Variant keys spelled out as an array. */
export function plainSimplified(simplified: Simplified) {
  return {
    ...simplified,
    variants: { ...simplified.variants, keys: [...simplified.variants.keys] }
  };
}

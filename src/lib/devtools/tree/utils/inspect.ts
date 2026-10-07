import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";

export function findNode(tree: ResponseDirectedTree, id: number | null): TreeNode | null {
  if (id === null) return null;
  return tree.nodes.find((node) => node.id === id) ?? null;
}

/** One-line header for the inspector: node count, compared Group ids, build key. */
export function treeSummary(tree: ResponseDirectedTree, key: string | null): string {
  const groups = tree.groups.map((group) => group.id).join(", ");
  return `${tree.nodes.length} nodes · groups: ${groups} · key: ${key ?? "none"}`;
}

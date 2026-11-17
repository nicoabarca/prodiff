/**
 * The figure a node shows under its name: what a built tree can offer, what the
 * view's choice resolves to on that tree, and the text it puts on one node.
 */
import { TRANSITION_TIME, isDurationAttribute } from "$lib/analysis/attributes";
import type { ResponseDirectedTree, TreeNode } from "$lib/tree/invokers/types";
import type { Statistic, TreeView } from "$lib/tree/types";
import { formatDuration, formatNumber } from "$lib/format";

/** A category is shown as the share of cases holding `value`, its commonest one on the tree. */
export type FigureAttribute =
  { kind: "number"; name: string } | { kind: "category"; name: string; value: string };

export type NodeFigure = { kind: "cases" } | { kind: "share" } | FigureAttribute;

function blocksOf(node: TreeNode) {
  return [
    ...Object.entries(node.eventLevel),
    ...(node.transitionTime ? ([[TRANSITION_TIME, node.transitionTime]] as const) : [])
  ];
}

function byName(a: string, b: string): number {
  return Number(isDurationAttribute(a)) - Number(isDurationAttribute(b)) || a.localeCompare(b);
}

/**
 * Every attribute a node can show, numbers first and durations last among them.
 * Read across all nodes because the Start root's blocks are empty, and an
 * attribute no node has a summary for offers nothing.
 */
export function figureAttributes(tree: ResponseDirectedTree): FigureAttribute[] {
  const numbers = new Set<string>();
  const tallies = new Map<string, Map<string, number>>();
  for (const node of tree.nodes) {
    for (const [name, block] of blocksOf(node)) {
      for (const summary of Object.values(block.summaries)) {
        if (summary.type === "numerical") {
          numbers.add(name);
          continue;
        }
        const tally = tallies.get(name) ?? new Map<string, number>();
        for (const [value, count] of Object.entries(summary.counts)) {
          tally.set(value, (tally.get(value) ?? 0) + count);
        }
        tallies.set(name, tally);
      }
    }
  }

  const categories = [...tallies]
    .filter(([, tally]) => tally.size > 0)
    .sort(([a], [b]) => byName(a, b))
    .map(([name, tally]): FigureAttribute => {
      const [value] = [...tally].reduce((best, entry) =>
        entry[1] > best[1] || (entry[1] === best[1] && entry[0].localeCompare(best[0]) < 0)
          ? entry
          : best
      );
      return { kind: "category", name, value };
    });

  return [
    ...[...numbers].sort(byName).map((name): FigureAttribute => ({ kind: "number", name })),
    ...categories
  ];
}

/**
 * What `view` asks a node to show, on a tree offering `attributes`. An attribute
 * the tree was not built with gives way to the first it was; with none, to cases.
 */
export function nodeFigure(
  view: Pick<TreeView, "metric" | "attribute">,
  attributes: FigureAttribute[]
): NodeFigure {
  if (view.metric !== "attribute") return { kind: view.metric };
  return (
    attributes.find((attribute) => attribute.name === view.attribute) ??
    attributes[0] ?? { kind: "cases" }
  );
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/**
 * A node's figure, one entry per Group in `tree.groups` order so each carries
 * its colour. An entry is `null` when that Group has nothing to show there.
 * `cases` is what is on screen at this node; a share divides it by the Group's
 * whole case count.
 */
export function nodeFigures(
  node: TreeNode,
  figure: NodeFigure,
  statistic: Statistic,
  cases: Record<string, number>,
  groups: ResponseDirectedTree["groups"]
): (string | null)[] {
  return groups.map((group) => {
    const count = cases[group.id] ?? 0;
    if (figure.kind === "cases") return count === 0 ? null : formatNumber(count);
    if (figure.kind === "share") {
      const total = Number(group.caseCount);
      return count === 0 || total === 0 ? null : percent(count / total);
    }

    const block =
      figure.name === TRANSITION_TIME ? node.transitionTime : node.eventLevel[figure.name];
    const summary = block?.summaries[group.id];
    if (figure.kind === "category") {
      return summary?.type === "categorical" && summary.n > 0
        ? percent((summary.counts[figure.value] ?? 0) / summary.n)
        : null;
    }
    if (summary?.type !== "numerical") return null;
    return isDurationAttribute(figure.name)
      ? formatDuration(summary[statistic])
      : formatNumber(Math.round(summary[statistic]));
  });
}

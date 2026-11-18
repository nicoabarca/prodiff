/**
 * The figure an activity shows under its name: what a built graph can offer,
 * what the view's choice resolves to on that graph, and the text it puts on one
 * activity. Every share here is the one its Significance Test compares.
 */
import { isDurationAttribute } from "$lib/analysis/attributes";
import type { Summary } from "$lib/analysis/types";
import { formatNumber } from "$lib/format";
import type { Counts, DfgNode, ResponseDfg } from "$lib/dfg/invokers/types";
import { REPETITIONS, type DfgView, type FaceGroup } from "$lib/dfg/types";
import { durationLabel, faceCounts } from "$lib/dfg/utils/face";
import type { Statistic } from "$lib/tree/types";

/**
 * A number prints its statistic. A category prints the share of cases holding
 * `value`: among those reaching the activity with a value for a column, among
 * those reaching it for Repetitions.
 */
export type FigureAttribute =
  { kind: "number"; name: string } | { kind: "category"; name: string; value: string };

export type NodeFigure =
  { kind: "cases" } | { kind: "events" } | { kind: "share" } | FigureAttribute;

/** The categories a share counts. Mirror `HELD` and `REPEATED` in `src-tauri/src/dfg/`. */
const HELD = "Held";
const REPEATED = "More than once";

function byName(a: string, b: string): number {
  return Number(isDurationAttribute(a)) - Number(isDurationAttribute(b)) || a.localeCompare(b);
}

/** The commonest value of a tally, ties broken by name. */
function commonest(tally: Map<string, number>): string {
  return [...tally].reduce((best, entry) =>
    entry[1] > best[1] || (entry[1] === best[1] && entry[0].localeCompare(best[0]) < 0)
      ? entry
      : best
  )[0];
}

/**
 * Every attribute an activity can show, numbers first and durations last among
 * them. A column's category offers its commonest value across the graph, and
 * Repetitions the share of cases running the activity more than once. Activity
 * Frequency is the `share` figure, so it is not offered again.
 */
export function figureAttributes(graph: ResponseDfg | null): FigureAttribute[] {
  const numbers = new Set<string>();
  let repeated = false;
  const tallies = new Map<string, Map<string, number>>();
  for (const node of graph?.nodes ?? []) {
    for (const [name, block] of Object.entries(node.attributes)) {
      for (const summary of Object.values(block.summaries)) {
        if (summary.type === "numerical") numbers.add(name);
        else if (name === REPETITIONS) repeated = true;
      }
    }
    for (const [name, values] of Object.entries(node.values)) {
      const tally = tallies.get(name) ?? new Map<string, number>();
      for (const [value, block] of Object.entries(values)) {
        for (const summary of Object.values(block.summaries)) {
          if (summary.type !== "categorical") continue;
          tally.set(value, (tally.get(value) ?? 0) + (summary.counts[HELD] ?? 0));
        }
      }
      tallies.set(name, tally);
    }
  }

  const categories: FigureAttribute[] = [
    ...[...tallies]
      .filter(([, tally]) => tally.size > 0)
      .map(([name, tally]) => ({ name, value: commonest(tally) })),
    ...(repeated ? [{ name: REPETITIONS, value: REPEATED }] : [])
  ]
    .sort((a, b) => byName(a.name, b.name))
    .map(({ name, value }) => ({ kind: "category", name, value }));

  return [
    ...[...numbers].sort(byName).map((name): FigureAttribute => ({ kind: "number", name })),
    ...categories
  ];
}

/**
 * What `view` asks an activity to show, on a graph offering `attributes`. An
 * attribute the graph was not built with gives way to the first it was; with
 * none, to cases.
 */
export function nodeFigure(
  view: Pick<DfgView, "figure" | "attribute">,
  attributes: FigureAttribute[]
): NodeFigure {
  if (view.figure !== "attribute") return { kind: view.figure };
  return (
    attributes.find((attribute) => attribute.name === view.attribute) ??
    attributes[0] ?? { kind: "cases" }
  );
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** The share of a two-by-two's cases in `value`, or `null` with no cases. */
function shareOf(summary: Summary | undefined, value: string): string | null {
  if (summary?.type !== "categorical" || summary.n === 0) return null;
  return percent((summary.counts[value] ?? 0) / summary.n);
}

/**
 * An activity's figure, one entry per Group in the order compared, `null`
 * where that Group has nothing to show there. `share` is the Group's cases
 * reaching it over every case it holds, as Activity Frequency tests it.
 */
export function nodeFigures(
  counts: Record<string, Counts>,
  node: DfgNode | undefined,
  figure: NodeFigure,
  statistic: Statistic,
  caseCounts: Map<string, number>,
  groups: FaceGroup[]
): Record<string, string | null> {
  if (figure.kind === "cases" || figure.kind === "events") {
    return faceCounts(counts, groups, figure.kind);
  }
  return Object.fromEntries(
    groups.map((group): [string, string | null] => {
      if (figure.kind === "share") {
        const reached = counts[group.id]?.cases ?? 0;
        const total = caseCounts.get(group.id) ?? 0;
        return [group.id, reached === 0 || total === 0 ? null : percent(reached / total)];
      }
      if (figure.kind === "category") {
        const value = node?.values[figure.name]?.[figure.value];
        return [
          group.id,
          value
            ? shareOf(value.summaries[group.id], HELD)
            : shareOf(node?.attributes[figure.name]?.summaries[group.id], figure.value)
        ];
      }
      const summary = node?.attributes[figure.name]?.summaries[group.id];
      if (summary?.type !== "numerical" || summary.n === 0) return [group.id, null];
      return [
        group.id,
        isDurationAttribute(figure.name)
          ? durationLabel(summary[statistic])
          : formatNumber(Math.round(summary[statistic]))
      ];
    })
  );
}

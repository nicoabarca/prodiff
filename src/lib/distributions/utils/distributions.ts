/**
 * The value counts behind one node's charts, arranged for drawing. Rust
 * aggregates; the one thing computed here is the `Other` bucket.
 */
import { formatDecimal, formatDuration, formatNumber } from "$lib/format";
import type { Distribution, DurationShape } from "$lib/distributions/invokers/types";
import {
  TOP_CATEGORIES,
  type Bar,
  type CurveRow,
  type GridAttribute,
  type Sort
} from "$lib/distributions/types";
import type { TreeNode } from "$lib/tree/invokers/types";
import { isDurationAttribute, TRANSITION_TIME } from "$lib/tree/utils/settings";

/**
 * The bars for a categorical Distribution. Everything past the cutoff folds into
 * one `Other` bar counted from the totals, not from the rows on screen, so it
 * stays exact despite the backend's own cap on the list.
 */
export function categoryBars(
  distribution: Extract<Distribution, { type: "categorical" }>,
  showAll: boolean,
  ids: string[]
): Bar[] {
  const shown = showAll ? distribution.values : distribution.values.slice(0, TOP_CATEGORIES);
  const bars: Bar[] = shown.map((count) => ({
    label: count.value,
    counts: Object.fromEntries(ids.map((id) => [id, count.counts[id] ?? 0]))
  }));

  const other = Object.fromEntries(
    ids.map((id) => [
      id,
      (distribution.totals[id] ?? 0) - bars.reduce((sum, bar) => sum + bar.counts[id], 0)
    ])
  );
  const collapsed = distribution.distinct - shown.length;
  if (collapsed > 0 && Object.values(other).some((count) => count > 0)) {
    bars.push({ label: "Other", counts: other, collapsed });
  }
  return bars;
}

/** A bin's range, read as a duration when the attribute is one. */
function binLabel(edges: number[], index: number, duration: boolean): string {
  const format = (value: number) =>
    duration ? formatDuration(value) : formatDecimal(value, edgeDigits(edges));
  return `${format(edges[index])}–${format(edges[index + 1])}`;
}

/** Enough decimals to tell adjacent bin edges apart. */
function edgeDigits(edges: number[]): number {
  const width = edges[1] - edges[0];
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(width)) + 1));
}

export function binBars(
  distribution: Extract<Distribution, { type: "numerical" }>,
  attribute: string,
  ids: string[]
): Bar[] {
  const duration = isDurationAttribute(attribute);
  const counts = Object.fromEntries(ids.map((id) => [id, distribution.counts[id] ?? []]));
  return (counts[ids[0]] ?? []).map((_, index) => ({
    label: binLabel(distribution.edges, index, duration),
    counts: Object.fromEntries(ids.map((id) => [id, counts[id][index] ?? 0]))
  }));
}

/**
 * The share of a Group's cases at or below `value`. The ladder's index *is*
 * the percentile, so this searches for the last rung reached.
 */
export function shareAt(ladder: number[], value: number): number | null {
  if (ladder.length < 2) return null;
  if (value < ladder[0]) return 0;
  let low = 0;
  let high = ladder.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ladder[mid] <= value) low = mid;
    else high = mid - 1;
  }
  return low / (ladder.length - 1);
}

/**
 * Every Group's curve on one set of rows. The ladders sample the same
 * percentiles at *different* durations, so none can be plotted against
 * another's x; the union of their values gives a shared one.
 */
export function curveRows(ladders: Record<string, number[]>): CurveRow[] {
  const entries = Object.entries(ladders);
  const values = [...new Set(entries.flatMap(([, ladder]) => ladder))].sort((x, y) => x - y);
  return values.map((value) => ({
    value,
    shares: Object.fromEntries(entries.map(([id, ladder]) => [id, shareAt(ladder, value)]))
  }));
}

/** The bars of the log ladder, labelled by their own edges: the width is the information. */
export function logBars(shape: DurationShape, ids: string[]): Bar[] {
  const counts = Object.fromEntries(ids.map((id) => [id, shape.logCounts[id] ?? []]));
  return (counts[ids[0]] ?? []).map((_, index) => ({
    label: `${formatDuration(shape.logEdges[index])}–${formatDuration(shape.logEdges[index + 1])}`,
    counts: Object.fromEntries(ids.map((id) => [id, counts[id][index] ?? 0]))
  }));
}

/** What a box plot leaves out: how much was counted but not drawn, and the cutoff. */
export function outlierNote(
  group: string,
  stats: { whiskerLow: number; whiskerHigh: number; outliersLow: number; outliersHigh: number },
  format: (value: number) => string
): string | null {
  const parts: string[] = [];
  if (stats.outliersHigh > 0) {
    parts.push(`${formatNumber(stats.outliersHigh)} over ${format(stats.whiskerHigh)}`);
  }
  if (stats.outliersLow > 0) {
    parts.push(`${formatNumber(stats.outliersLow)} under ${format(stats.whiskerLow)}`);
  }
  return parts.length === 0 ? null : `${group}: ${parts.join(", ")}, not plotted`;
}

/**
 * The cards the grid shows for one node, in order. It opens on what the build
 * tested; anything else is opt-in through `extra`, which follows the user from
 * node to node. Tested attributes lead, strongest first; the untested ones
 * follow by name under their own heading.
 */
export function gridAttributes(
  node: TreeNode,
  extra: string[],
  dismissed: Iterable<string>,
  sort: Sort
): GridAttribute[] {
  const hidden = new Set(dismissed);
  const cards: GridAttribute[] = Object.entries(node.eventLevel).map(([name, block]) => ({
    name,
    test: block.test ?? null,
    inBuild: true
  }));
  if (node.transitionTime) {
    cards.push({ name: TRANSITION_TIME, test: node.transitionTime.test ?? null, inBuild: true });
  }

  const known = new Set(cards.map((card) => card.name));
  for (const name of extra) {
    if (!known.has(name)) cards.push({ name, test: null, inBuild: false });
  }

  const byName = (x: GridAttribute, y: GridAttribute) => x.name.localeCompare(y.name);
  return cards
    .filter((card) => !hidden.has(card.name))
    .sort((x, y) => {
      // Tested first whatever the sort, so the divider stays one cut down the list.
      if ((x.test === null) !== (y.test === null)) return x.test === null ? 1 : -1;
      if (sort === "name" || x.test === null || y.test === null) return byName(x, y);
      return y.test.effectSize - x.test.effectSize || byName(x, y);
    });
}

/**
 * The bars a card draws, whatever kind of Distribution it holds. `ids` is the
 * Groups being compared, in the order the card draws them.
 */
export function bars(
  distribution: Distribution,
  attribute: string,
  showAll: boolean,
  ids: string[]
): Bar[] {
  if (distribution.type === "categorical") return categoryBars(distribution, showAll, ids);
  if (distribution.type === "numerical") return binBars(distribution, attribute, ids);
  return [];
}

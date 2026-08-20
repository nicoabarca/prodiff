/**
 * Distributions — the value counts behind one node's charts, arranged for
 * drawing. Fetched per selected node; see `docs/adr/0003`. Rust aggregates and
 * the frontend only draws; the one thing computed here is the `Other` bucket.
 */
import { formatDecimal, formatDuration, formatNumber } from "$lib/format";
import type { Distribution, DurationShape } from "$lib/distributions/invokers/types";
import { TOP_CATEGORIES, type Bar, type CurveRow, type GridAttribute, type Sort } from "$lib/distributions/types";
import type { TreeNode } from "$lib/tree/invokers/types";
import { isDurationAttribute, TRANSITION_TIME } from "$lib/tree/utils/settings";

/**
 * The bars for a categorical Distribution. Everything past the cutoff folds
 * into one `Other` bar counted from the totals, not from the rows on screen,
 * so it stays exact despite the backend's own cap on the list.
 */
export function categoryBars(
  distribution: Extract<Distribution, { type: "categorical" }>,
  showAll: boolean
): Bar[] {
  const shown = showAll ? distribution.values : distribution.values.slice(0, TOP_CATEGORIES);
  const bars: Bar[] = shown.map((count) => ({
    label: count.value,
    a: count.a,
    b: count.b
  }));

  const otherA = distribution.totalA - shown.reduce((sum, c) => sum + c.a, 0);
  const otherB = distribution.totalB - shown.reduce((sum, c) => sum + c.b, 0);
  const collapsed = distribution.distinct - shown.length;
  if (collapsed > 0 && otherA + otherB > 0) {
    bars.push({ label: "Other", a: otherA, b: otherB, collapsed });
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
  attribute: string
): Bar[] {
  const duration = isDurationAttribute(attribute);
  return distribution.countsA.map((a, index) => ({
    label: binLabel(distribution.edges, index, duration),
    a,
    b: distribution.countsB[index]
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
 * Both Groups' curves on one set of rows. The two ladders sample the same
 * percentiles at *different* durations, so neither can be plotted against the
 * other's x; the union of their values gives a shared one.
 */
export function curveRows(ecdfA: number[], ecdfB: number[]): CurveRow[] {
  const values = [...new Set([...ecdfA, ...ecdfB])].sort((x, y) => x - y);
  return values.map((value) => ({
    value,
    a: shareAt(ecdfA, value),
    b: shareAt(ecdfB, value)
  }));
}

/**
 * The bars of the log ladder, labelled by their own edges rather than by an
 * index: with unequal bins the width is the information.
 */
export function logBars(shape: DurationShape): Bar[] {
  return shape.logCountsA.map((a, index) => ({
    label: `${formatDuration(shape.logEdges[index])}–${formatDuration(shape.logEdges[index + 1])}`,
    a,
    b: shape.logCountsB[index]
  }));
}

/**
 * What a box plot leaves out, in plain words — how much was counted rather
 * than drawn, and the cutoff it stopped at. Avoids the word "whisker".
 */
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
 * node to node.
 *
 * Tested attributes lead, strongest first. The untested ones follow by name
 * under their own heading, so an unbadged card is never read as "no difference
 * found" when it means "never looked".
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

/** The bars a card draws, whatever kind of Distribution it holds. */
export function bars(distribution: Distribution, attribute: string, showAll: boolean): Bar[] {
  if (distribution.type === "categorical") return categoryBars(distribution, showAll);
  if (distribution.type === "numerical") return binBars(distribution, attribute);
  return [];
}

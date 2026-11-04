import type { NumericMode } from "$lib/filters/kind/numeric";

/**
 * A numeric column read as shares of its values. `points` holds the observed
 * value at evenly spaced ranks, ascending, so a share in 0–1 is a position along
 * them and a repeated value is a run of equal points.
 */

/** A stretch of the shares, start then end. */
export type ShareSpan = [number, number];

const EVERYTHING: ShareSpan[] = [[0, 1]];

function shareAt(points: number[], index: number): number {
  return index / (points.length - 1);
}

/** The share of values strictly below `value`: where a lower bound's run begins. */
export function shareBelow(points: number[], value: number): number {
  const index = points.findIndex((point) => point >= value);
  return index === -1 ? 1 : shareAt(points, index);
}

/** The share of values at or below `value`: where an upper bound's run ends. */
export function shareAtOrBelow(points: number[], value: number): number {
  for (let index = points.length - 1; index >= 0; index--) {
    if (points[index] <= value) return shareAt(points, index);
  }
  return 0;
}

/** The observed value at a share. */
export function valueAt(points: number[], share: number): number {
  return points[Math.round(share * (points.length - 1))];
}

/** The stretches of the shares these bounds keep. Mirrors `numeric_predicate` in `predicates.rs`. */
export function keptSpans(
  points: number[],
  mode: NumericMode,
  min: number | null,
  max: number | null
): ShareSpan[] {
  const low = mode === "below" || min === null ? null : shareBelow(points, min);
  const high = mode === "above" || max === null ? null : shareAtOrBelow(points, max);
  const present = (spans: ShareSpan[]) => spans.filter(([start, end]) => start < end);

  if (mode === "between" || mode === "above" || mode === "below") {
    return present([[low ?? 0, high ?? 1]]);
  }
  if (low === null && high === null) return EVERYTHING;
  if (low === null) return present([[high as number, 1]]);
  if (high === null) return present([[0, low]]);
  // A lower bound past the upper one puts every value outside the range.
  if (low > high) return EVERYTHING;
  return present([
    [0, low],
    [high, 1]
  ]);
}

/** How much of the shares `spans` cover. */
export function spannedShare(spans: ShareSpan[]): number {
  return spans.reduce((total, [start, end]) => total + (end - start), 0);
}

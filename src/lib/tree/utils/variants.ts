import type { ResponseVariantRow } from "$lib/tree/invokers/types";

/** Cases on a Variant across every Group: the ranking the backend cut uses. */
export function variantCases(row: ResponseVariantRow): number {
  return Object.values(row.cases).reduce((sum, cases) => sum + cases, 0);
}

/**
 * The fewest Variants holding `coverage` of the cases, biggest first. Mirrors
 * the backend's cold-build pick, so both land on the same set.
 */
export function variantsCovering(rows: ResponseVariantRow[], coverage: number): Set<string> {
  const total = rows.reduce((sum, row) => sum + variantCases(row), 0);
  const target = total * coverage;
  const keys = new Set<string>();
  let covered = 0;
  for (const row of rows) {
    // At least one always survives: an empty selection blocks the build.
    if (covered >= target && keys.size > 0) break;
    covered += variantCases(row);
    keys.add(row.key);
  }
  return keys;
}

/** The share of every case the Variants keyed in `keys` hold, from 0 to 1. */
export function casesShare(rows: ResponseVariantRow[], keys: Set<string>): number {
  const total = rows.reduce((sum, row) => sum + variantCases(row), 0);
  if (total === 0) return 0;
  const held = rows
    .filter((row) => keys.has(row.key))
    .reduce((sum, row) => sum + variantCases(row), 0);
  return held / total;
}

/**
 * The share of every case the biggest Variant holds, from 0 to 1: the least
 * coverage a selection can hold, since a build needs one Variant. An empty list
 * answers 1.
 */
export function coverageFloor(rows: ResponseVariantRow[]): number {
  const total = rows.reduce((sum, row) => sum + variantCases(row), 0);
  if (total === 0) return 1;
  return rows.reduce((max, row) => Math.max(max, variantCases(row)), 0) / total;
}

/**
 * Events one Group contributes to a Variant: every case there walks the same
 * trace, so it is the trace length times the cases.
 */
export function variantEvents(row: ResponseVariantRow, groupId: string): number {
  return (row.cases[groupId] ?? 0) * row.activities.length;
}

/** Whether two selections name the same Variants. Order carries no meaning. */
export function sameSelection(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

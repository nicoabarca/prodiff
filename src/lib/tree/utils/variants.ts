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

/**
 * Events one Group contributes to a Variant: every case there walks the same
 * trace, so it is the trace length times the cases.
 */
export function variantEvents(row: ResponseVariantRow, groupId: string): number {
  return (row.cases[groupId] ?? 0) * row.activities.length;
}

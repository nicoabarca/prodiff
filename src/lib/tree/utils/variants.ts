import type { ResponseVariantRow } from "$lib/tree/invokers/types";

/** Cases on a Variant across both Groups — the ranking the backend cut uses. */
export function variantCases(row: ResponseVariantRow): number {
  return row.casesA + row.casesB;
}

/**
 * The fewest Variants holding `coverage` of the cases, biggest first. Mirrors
 * the backend's cold-build pick, so seeding the picker and letting Rust choose
 * land on the same set.
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

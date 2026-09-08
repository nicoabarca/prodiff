/** Narrowing the Variant list, and comparing one selection to another. */

import type { ResponseVariantRow } from "$lib/tree/invokers/types";

/**
 * Whether the Variant runs through every activity of `sequence`, in that order.
 * Gaps are allowed: the steps need not be adjacent. An empty sequence matches
 * every Variant.
 */
export function matchesSequence(activities: string[], sequence: string[]): boolean {
  let step = 0;
  for (const activity of activities) {
    if (step === sequence.length) return true;
    if (activity === sequence[step]) step += 1;
  }
  return step === sequence.length;
}

export function filterVariants(
  rows: ResponseVariantRow[],
  sequence: string[]
): ResponseVariantRow[] {
  if (sequence.length === 0) return rows;
  return rows.filter((row) => matchesSequence(row.activities, sequence));
}

/** Every activity name the Variants use, alphabetically. */
export function activityOptions(rows: ResponseVariantRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) for (const activity of row.activities) names.add(activity);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Whether two selections name the same Variants. Order carries no meaning. */
export function sameSelection(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

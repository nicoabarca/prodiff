import type { Filter } from "$lib/filters/kind/filter";

/**
 * Whether a Filter List keeps some cases with only part of their events: an
 * attribute Filter in `keep_selected` mode or a timeframe Filter in `trim` mode.
 * Pass a Group's applied `filters`, never a draft.
 */
export function isTrimmed(filters: Filter[]): boolean {
  return filters.some(
    (filter) =>
      (filter.kind === "attribute" && filter.mode === "keep_selected") ||
      (filter.kind === "timeframe" && filter.mode === "trim")
  );
}

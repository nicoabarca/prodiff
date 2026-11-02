import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Filter } from "$lib/filters/kind/filter";

/**
 * Whether a Filter List keeps some cases with only part of their events: an
 * attribute Filter in `keep_selected` mode on an event-level column, or a
 * timeframe Filter in `trim` mode. Pass a Group's applied `filters`, never a
 * draft.
 */
export function isTrimmed(filters: Filter[], columns: RequestColumnMapping[]): boolean {
  const caseLevel = (name: string) => columns.some((c) => c.name === name && c.scope === "case");
  return filters.some(
    (filter) =>
      (filter.kind === "attribute" &&
        filter.mode === "keep_selected" &&
        !caseLevel(filter.column)) ||
      (filter.kind === "timeframe" && filter.mode === "trim")
  );
}

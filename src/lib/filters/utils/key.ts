import type { Filter } from "$lib/filters/kind/filter";

export function filtersKey(filters: Filter[]): string {
  return JSON.stringify(filters);
}

import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { TreeSettings } from "$lib/tree/types";

/** Derived attributes — not columns, but selectable like any other. */
export const ACTIVITY_DURATION = "Activity Duration";
export const TRANSITION_TIME = "Transition Time";

/**
 * What the user can ask the backend to test. Hidden columns are left out.
 */
export function attributeOptions(columns: RequestColumnMapping[], hidden: string[] = []): string[] {
  const mapped = columns
    .filter((c) => c.role === "other" && !hidden.includes(c.name))
    .map((c) => c.name);
  const hasStart = columns.some((c) => c.role === "start_timestamp");
  return [...mapped, ...(hasStart ? [ACTIVITY_DURATION] : []), TRANSITION_TIME];
}

export function isNumericAttribute(columns: RequestColumnMapping[], attribute: string): boolean {
  if (attribute === ACTIVITY_DURATION || attribute === TRANSITION_TIME) return true;
  const column = columns.find((c) => c.name === attribute);
  return column?.type === "integer" || column?.type === "float";
}

/** Attributes whose values are milliseconds, so the panel formats them as durations. */
export function isDurationAttribute(attribute: string): boolean {
  return attribute === ACTIVITY_DURATION || attribute === TRANSITION_TIME;
}

/**
 * Identifies the numbers a build produces, for the in-memory cache. Sorted, so
 * checking Variants in a different order doesn't read as a different tree.
 */
export function treeKey(groups: string[], settings: TreeSettings): string {
  return JSON.stringify([groups, settings.attributes, [...settings.selectedVariants].sort()]);
}

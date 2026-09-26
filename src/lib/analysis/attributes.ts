/**
 * The attribute vocabulary every comparison view shares: what can be asked for,
 * how it is tested, and how it is read back. Mirrors the constants in
 * `src-tauri/src/analysis/`.
 */
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";

/** Derived attributes: not columns, but selectable like any other. */
export const ACTIVITY_DURATION = "Activity Duration";
export const TRANSITION_TIME = "Transition Time";

/**
 * What the user can ask the backend to test. Hidden columns are left out. The
 * columns are ordered by name; the derived attributes come after them, and the
 * `custom` columns, in their own order, after those.
 */
export function attributeOptions(
  columns: RequestColumnMapping[],
  hidden: string[] = [],
  custom: string[] = []
): string[] {
  const mapped = columns
    .filter((c) => c.role === "other" && !hidden.includes(c.name))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));
  const hasStart = columns.some((c) => c.role === "start_timestamp");
  return [...mapped, ...(hasStart ? [ACTIVITY_DURATION] : []), TRANSITION_TIME, ...custom];
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

import { formatDuration } from "$lib/format";
import { describeBounds, hasBounds, type NumericMode } from "$lib/filters/kind/numeric";

/** `min`/`max` are days (fractional); duration is a case's last event minus its first. */
export interface DurationFilter {
  kind: "duration";
  mode: NumericMode;
  min: number | null;
  max: number | null;
}

/** The explanatory text shown beside each mode in the filter editor. */
export const DURATION_MODE_INFO: Record<NumericMode, { label: string; description: string }> = {
  above: { label: "Above", description: "Keeps cases that last at least this long." },
  below: { label: "Below", description: "Keeps cases that last at most this long." },
  between: {
    label: "In range",
    description: "Keeps cases whose duration is inside the range. Limits are included."
  },
  outside: {
    label: "Outside range",
    description: "Keeps cases whose duration is outside the range. Limits are excluded."
  }
};

const DAY_MS = 86_400_000;

export function describeDuration(filter: DurationFilter): { title: string; detail: string } {
  // Bounds are days but read as durations: a brushed range is rarely a whole number.
  const span = (days: number | null) => (days === null ? "∞" : formatDuration(days * DAY_MS));
  return {
    title: "Case duration",
    detail: describeBounds(filter.mode, span(filter.min), span(filter.max))
  };
}

export function isDurationComplete(filter: DurationFilter): boolean {
  return hasBounds(filter.mode, filter.min, filter.max);
}

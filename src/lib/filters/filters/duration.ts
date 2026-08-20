import { formatDuration } from "$lib/format";
import { describeBounds, hasBounds, type NumericMode } from "$lib/filters/filters/numeric";

/** `min`/`max` are days (fractional); duration is a case's last event minus its first. */
export interface DurationFilter {
  kind: "duration";
  mode: NumericMode;
  min: number | null;
  max: number | null;
}

const DAY_MS = 86_400_000;

export function describeDuration(filter: DurationFilter): { title: string; detail: string } {
  // Bounds are days but read as durations — a brushed range is rarely a whole
  // number of them.
  const span = (days: number | null) => (days === null ? "∞" : formatDuration(days * DAY_MS));
  return {
    title: "Case duration",
    detail: describeBounds(filter.mode, span(filter.min), span(filter.max))
  };
}

export function isDurationComplete(filter: DurationFilter): boolean {
  return hasBounds(filter.mode, filter.min, filter.max);
}

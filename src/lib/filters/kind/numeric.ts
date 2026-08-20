/**
 * `NUMERIC_MODES` is shared with the duration kind, which bounds a case
 * duration the same four ways — the same pairing `enums.rs` makes in Rust.
 */
export const NUMERIC_MODES = ["above", "below", "between", "outside"] as const;
export type NumericMode = (typeof NUMERIC_MODES)[number];

export interface NumericFilter {
  kind: "numeric";
  column: string;
  mode: NumericMode;
  min: number | null;
  max: number | null;
}

export const NUMERIC_MODE_INFO: Record<NumericMode, { label: string; description: string }> = {
  above: { label: "Above", description: "Keeps cases with an event at or above the value." },
  below: { label: "Below", description: "Keeps cases with an event at or below the value." },
  between: {
    label: "In range",
    description: "Keeps cases with an event inside the range. Limits are included."
  },
  outside: {
    label: "Outside range",
    description: "Keeps cases with an event outside the range. Limits are excluded."
  }
};

/**
 * The bounds of a `NumericMode` as text, given each bound already formatted.
 * Shared with the duration kind, which formats its bounds as durations.
 */
export function describeBounds(mode: NumericMode, low: string, high: string): string {
  return mode === "above"
    ? `≥ ${low}`
    : mode === "below"
      ? `≤ ${high}`
      : mode === "between"
        ? `${low} … ${high}`
        : `< ${low} or > ${high}`;
}

/** Whether a `NumericMode`'s bounds are filled in enough to mean anything. */
export function hasBounds(mode: NumericMode, min: number | null, max: number | null): boolean {
  return mode === "above"
    ? min !== null
    : mode === "below"
      ? max !== null
      : min !== null || max !== null;
}

export function describeNumeric(filter: NumericFilter): { title: string; detail: string } {
  const low = filter.min ?? "−∞";
  const high = filter.max ?? "∞";
  return { title: filter.column, detail: describeBounds(filter.mode, String(low), String(high)) };
}

export function isNumericComplete(filter: NumericFilter): boolean {
  return hasBounds(filter.mode, filter.min, filter.max);
}

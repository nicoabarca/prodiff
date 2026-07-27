/**
 * The filter vocabulary, shared with `src-tauri/src/filters/mod.rs` — these
 * types are the wire format, so any change here needs the matching serde enum
 * changed too.
 *
 * Every filter is an event-level predicate lifted to whole cases; the `mode` is
 * what picks the lift. See CONTEXT.md for the Slice / Filter definitions.
 */

export const ATTRIBUTE_MODES = ["mandatory", "forbidden", "keep_selected"] as const;
export type AttributeMode = (typeof ATTRIBUTE_MODES)[number];

export const NUMERIC_MODES = ["above", "below", "between", "outside"] as const;
export type NumericMode = (typeof NUMERIC_MODES)[number];

export const TIMEFRAME_MODES = ["intersects", "disjoint", "contained", "trim"] as const;
export type TimeframeMode = (typeof TIMEFRAME_MODES)[number];

export const ENDPOINT_MODES = ["mandatory", "forbidden"] as const;
export type EndpointMode = (typeof ENDPOINT_MODES)[number];

export const ENDPOINT_POSITIONS = ["start", "end"] as const;
export type EndpointPosition = (typeof ENDPOINT_POSITIONS)[number];

export interface AttributeFilter {
  kind: "attribute";
  column: string;
  mode: AttributeMode;
  values: string[];
}

export interface NumericFilter {
  kind: "numeric";
  column: string;
  mode: NumericMode;
  min: number | null;
  max: number | null;
}

/** `from`/`to` are epoch milliseconds, matching the Rust side. */
export interface TimeframeFilter {
  kind: "timeframe";
  mode: TimeframeMode;
  from: number;
  to: number;
}

export interface EndpointFilter {
  kind: "endpoint";
  position: EndpointPosition;
  mode: EndpointMode;
  activities: string[];
}

export type Filter = AttributeFilter | NumericFilter | TimeframeFilter | EndpointFilter;
export type FilterKind = Filter["kind"];

/** The explanatory text shown beside each mode in the filter editor. */
export const ATTRIBUTE_MODE_INFO: Record<AttributeMode, { label: string; description: string }> = {
  mandatory: {
    label: "Mandatory",
    description:
      "Removes cases that do not contain at least one event with a selected value. Retained cases are kept whole."
  },
  forbidden: {
    label: "Forbidden",
    description:
      "Removes cases that contain at least one event with a selected value. Non-matching cases are retained whole."
  },
  keep_selected: {
    label: "Keep selected",
    description:
      "Removes individual events that do not carry a selected value. Surviving cases keep only matching events, so their variant becomes a sub-sequence of the original."
  }
};

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

export const TIMEFRAME_MODE_INFO: Record<TimeframeMode, { label: string; description: string }> = {
  intersects: {
    label: "Intersecting",
    description: "Keeps cases with at least one event inside the window."
  },
  contained: {
    label: "Contained",
    description: "Keeps only cases that start and finish inside the window."
  },
  disjoint: {
    label: "Outside window",
    description: "Removes every case that has an event inside the window."
  },
  trim: {
    label: "Trim to window",
    description: "Keeps only the events inside the window; cases survive with a shorter trace."
  }
};

export const ENDPOINT_MODE_INFO: Record<EndpointMode, { label: string; description: string }> = {
  mandatory: { label: "Mandatory", description: "Keeps only cases with a selected endpoint." },
  forbidden: { label: "Forbidden", description: "Removes cases with a selected endpoint." }
};

/** The column a filter reads, or `null` for filters not tied to one. */
export function filterColumn(filter: Filter): string | null {
  return filter.kind === "attribute" || filter.kind === "numeric" ? filter.column : null;
}

function formatDate(millis: number): string {
  return new Date(millis).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

/** Title/detail pair for a filter chip. */
export function describeFilter(filter: Filter): { title: string; detail: string } {
  switch (filter.kind) {
    case "attribute":
      return {
        title: `${filter.column} — ${ATTRIBUTE_MODE_INFO[filter.mode].label.toLowerCase()}`,
        detail: filter.values.join(", ") || "no values selected"
      };
    case "numeric": {
      const low = filter.min ?? "−∞";
      const high = filter.max ?? "∞";
      const detail =
        filter.mode === "above"
          ? `≥ ${low}`
          : filter.mode === "below"
            ? `≤ ${high}`
            : filter.mode === "between"
              ? `${low} … ${high}`
              : `< ${low} or > ${high}`;
      return { title: filter.column, detail };
    }
    case "timeframe":
      return {
        title: TIMEFRAME_MODE_INFO[filter.mode].label,
        detail: `${formatDate(filter.from)} → ${formatDate(filter.to)}`
      };
    case "endpoint":
      return {
        title: filter.position === "start" ? "Starts with" : "Ends with",
        detail:
          (filter.activities.join(", ") || "no activities selected") +
          (filter.mode === "forbidden" ? " (excluded)" : "")
      };
  }
}

/**
 * A filter with no selection yet has no effect on the log but would read as one
 * in the UI, so the editor refuses to save it.
 */
export function isFilterComplete(filter: Filter): boolean {
  switch (filter.kind) {
    case "attribute":
      return filter.values.length > 0;
    case "numeric":
      return filter.mode === "above"
        ? filter.min !== null
        : filter.mode === "below"
          ? filter.max !== null
          : filter.min !== null || filter.max !== null;
    case "timeframe":
      return filter.from <= filter.to;
    case "endpoint":
      return filter.activities.length > 0;
  }
}

import { formatDay } from "$lib/format";

export const TIMEFRAME_MODES = ["intersects", "disjoint", "contained", "trim"] as const;
export type TimeframeMode = (typeof TIMEFRAME_MODES)[number];

/** `from`/`to` are epoch milliseconds, matching the Rust side. */
export interface TimeframeFilter {
  kind: "timeframe";
  mode: TimeframeMode;
  from: number;
  to: number;
}

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

export function describeTimeframe(filter: TimeframeFilter): { title: string; detail: string } {
  return {
    title: TIMEFRAME_MODE_INFO[filter.mode].label,
    detail: `${formatDay(filter.from)} → ${formatDay(filter.to)}`
  };
}

export function isTimeframeComplete(filter: TimeframeFilter): boolean {
  return filter.from <= filter.to;
}

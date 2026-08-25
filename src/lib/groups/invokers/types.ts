/** Mirrors `EventLogStats` in Rust. Durations are milliseconds, null for a Group with no cases. */
export interface ResponseEventLogStats {
  events: number;
  cases: number;
  activities: number;
  variants: number;
  avgEventsPerCase: number;
  avgCaseDurationMs: number | null;
  medianCaseDurationMs: number | null;
  minCaseDurationMs: number | null;
  maxCaseDurationMs: number | null;
  startActivities: number;
  endActivities: number;
  timespanStart: string | null;
  timespanEnd: string | null;
}

/** How much of the log survives one step of a Filter List. */
export interface ResponseFilterStep {
  cases: number;
  events: number;
}

/** Mirrors `PreviewTable` in Rust. */
export interface ResponsePreviewTable {
  columns: string[];
  rows: string[][];
  totalEvents: number;
}

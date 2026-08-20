/**
 * The invocation contracts for the event log commands — every type here mirrors
 * a serde struct or enum in `src-tauri/src/{column_mapping,parsing,event_log}`,
 * so a change on this side needs the matching change over there.
 */
export const COLUMN_ROLES = [
  "case_id",
  "activity_name",
  "complete_timestamp",
  "start_timestamp",
  "other"
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

// Must match (or translate cleanly from) a Rust/Polars dtype — see
// `dtype_label` in src-tauri/src/parsing/csv.rs, which is where this value
// actually originates for each column.
export const COLUMN_TYPES = ["string", "integer", "float", "boolean", "date", "datetime"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const COLUMN_GRANULARITIES = ["event", "case", "case_and_event"] as const;
export type ColumnGranularity = (typeof COLUMN_GRANULARITIES)[number];

export interface ColumnMapping {
  name: string;
  role: ColumnRole;
  type: ColumnType;
  granularity: ColumnGranularity;
}

/** What `preview_event_log` returns: the head of the file, typed. */
export interface ResponseEventLogPreview {
  columns: { name: string; dtype: ColumnType }[];
  rows: string[][];
}

/**
 * Result of writing the Event Log: stats plus where the files ended up on disk.
 * Rust returns the full `EventLogStats` — the per-case metrics beyond these are
 * recomputed per population by the Statistics view rather than stored on the
 * project, so they are picked off here instead of spread into the row.
 */
export interface ResponseCreateEventLog {
  events: number;
  cases: number;
  activities: number;
  variants: number;
  timespanStart: string | null;
  timespanEnd: string | null;
  originalPath: string;
  eventLogPath: string;
}

/**
 * The invocation contracts for the event log commands. Every type here mirrors a
 * serde struct or enum in `src-tauri/src/{column_mapping,parsing,event_log}`.
 */
export const COLUMN_ROLES = [
  "case_id",
  "activity_name",
  "complete_timestamp",
  "start_timestamp",
  "other"
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

// Must match (or translate cleanly from) a Rust/Polars dtype. See `dtype_label`
// in src-tauri/src/parsing/csv.rs, where this value originates per column.
export const COLUMN_TYPES = ["string", "integer", "float", "boolean", "date", "datetime"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const COLUMN_GRANULARITIES = ["event", "case", "case_and_event"] as const;
export type ColumnGranularity = (typeof COLUMN_GRANULARITIES)[number];

// `timestampFormat` is the pattern the user confirmed for a temporal column, in
// the vocabulary they were shown (`DD/MM/YYYY HH:mm`, not the Polars
// `%d/%m/%Y %H:%M`); Rust translates it at the seam. Null means no format was
// declared, and Polars is left to infer.
export interface RequestColumnMapping {
  name: string;
  role: ColumnRole;
  type: ColumnType;
  granularity: ColumnGranularity;
  timestampFormat: string | null;
}

/**
 * What `preview_event_log` returns: the head of the file, typed. `nullCount`
 * and `totalRows` cover the whole file, while `rows` is only its head, so a
 * column can show no gap in the preview and still report missing values.
 */
export interface ResponseEventLogPreview {
  columns: { name: string; dtype: ColumnType; nullCount: number }[];
  rows: string[][];
  totalRows: number;
}

/** How many of a column's values one pattern reads. */
export interface PatternCoverage {
  pattern: string;
  matched: number;
  failed: number;
}

/** A value the reported pattern could not read, and where it sits in the file. */
export interface DeviantValue {
  value: string;
  row: number;
}

/**
 * What `analyze_timestamp_columns` returns for one column, over every row of
 * the file. `nulls` are missing cells, which count against no pattern;
 * `fullCoverage` holds every pattern that read all the rest, so more than one
 * entry means the column is ambiguous and `best` is a guess. `best` is the
 * pattern reading the most values, which is not always one reading them all.
 */
export interface ResponseTimestampColumnReport {
  column: string;
  rows: number;
  nulls: number;
  fullCoverage: string[];
  best: string | null;
  coverage: PatternCoverage[];
  deviants: DeviantValue[];
}

/**
 * Result of writing the Event Log: stats plus where the files ended up on disk.
 * The per-case metrics beyond these are recomputed per population by the
 * Statistics view.
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

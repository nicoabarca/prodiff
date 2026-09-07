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

export const COLUMN_SCOPES = ["event", "case"] as const;
export type ColumnScope = (typeof COLUMN_SCOPES)[number];

// Which of a case's rows a case-scoped column is read from.
export const CASE_RESOLUTIONS = ["require_constant", "first", "last"] as const;
export type CaseResolution = (typeof CASE_RESOLUTIONS)[number];

export interface RequestColumnMapping {
  name: string;
  role: ColumnRole;
  type: ColumnType;
  scope: ColumnScope;
  caseResolution: CaseResolution;
  timestampFormat: string | null;
}

/** A case-scoped column whose value is not constant within at least one case. */
export interface ResponseCaseColumnViolation {
  column: string;
  cases: number;
  exampleCase: string;
  exampleValues: string[];
}

export interface ResponseEventLogPreview {
  columns: { name: string; dtype: ColumnType }[];
  rows: string[][];
}

export interface PatternCoverage {
  pattern: string;
  failed: number;
}

export interface ResponseTimestampColumnReport {
  column: string;
  rows: number;
  missing: number;
  best: string | null;
  coverage: PatternCoverage[];
  deviants: string[];
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

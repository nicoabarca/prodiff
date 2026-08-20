/**
 * The invocation contracts for the commands that populate a filter editor's
 * pickers — each mirrors a serde struct in `src-tauri/src/filters/structs.rs`.
 */

/** One day of the log's case load, counted in UTC on the Rust side. */
export interface DayLoad {
  dayMs: number;
  cases: number;
}

/** One bar of the case-duration histogram; bounds are milliseconds. */
export interface DurationBin {
  startMs: number;
  endMs: number;
  cases: number;
}

/** The values a column holds, capped — `truncated` says the cap was hit. */
export interface DistinctValues {
  values: string[];
  truncated: boolean;
}

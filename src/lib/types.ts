import type { ColumnMapping } from "$lib/column-mapping";
import type { Filter } from "$lib/filters";

/**
 * Every figure the Statistics view shows for one population. Mirrors
 * `EventLogStats` in `src-tauri/src/stats/mod.rs`. Durations are milliseconds,
 * and are `null` for a population with no cases.
 */
export interface EventLogStats {
  events: number;
  cases: number;
  activities: number;
  variants: number;
  avgEventsPerCase: number;
  avgCaseDurationMs: number | null;
  medianCaseDurationMs: number | null;
  startActivities: number;
  endActivities: number;
  timespanStart: string | null;
  timespanEnd: string | null;
}

/**
 * A named filter chain over a Project's Event Log. `base` (at most one per
 * project) applies to everything downstream; every `slice` chains on top of it.
 * `stats`/`statsKey` are a cache — a `statsKey` that no longer matches the
 * slice's effective chain means the numbers are stale and get recomputed.
 */
export type SliceKind = "base" | "slice";

export interface Slice {
  id: string;
  projectId: string;
  kind: SliceKind;
  name: string;
  /** A `--chart-*` CSS custom property name, assigned by position. */
  color: string;
  position: number;
  filters: Filter[];
  stats: EventLogStats | null;
  statsKey: string | null;
}

export interface Project {
  id: string;
  name: string;
  fileName: string;
  originalPath: string;
  eventLogPath: string;
  columns: ColumnMapping[];
  hiddenColumns: string[];
  events: number;
  cases: number;
  activities: number;
  variants: number;
  timespanStart: string | null;
  timespanEnd: string | null;
  createdAt: string;
}

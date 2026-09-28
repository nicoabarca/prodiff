/**
 * The Statistics view's comparison as Rust ships it. Every type here mirrors a
 * serde struct in `src-tauri/src/statistics/`.
 */
import type { Summary, Test } from "$lib/analysis/types";

export interface ResponseGroupComparison {
  groups: GroupFigures[];
  durationTest: Test | null;
  activities: ActivityRow[];
  attributes: AttributeRow[];
  variants: VariantRow[];
  variantCensus: VariantCensus;
  hasActivityDuration: boolean;
}

/** One Variant: its activities in order, and its cases per Group. Most cases first. */
export interface VariantRow {
  activities: string[];
  cases: Record<string, number>;
}

/** Every Variant counted. `only` holds, per Group, the Variants no other Group follows. */
export interface VariantCensus {
  total: number;
  shared: number;
  only: Record<string, number>;
}

/** Durations are milliseconds; `duration` is null for a Group with no cases. */
export interface GroupFigures {
  id: string;
  cases: number;
  duration: Extract<Summary, { type: "numerical" }> | null;
  durationP10: number | null;
  durationP90: number | null;
  startActivities: Record<string, number>;
  endActivities: Record<string, number>;
}

/** `cases` counts the cases touching the activity; `avgDurationMs` needs a start timestamp. */
export interface ActivityRow {
  name: string;
  cases: Record<string, number>;
  events: Record<string, number>;
  avgDurationMs: Record<string, number>;
}

/**
 * A categorical summary ships its 20 biggest values by pooled count; its `n`
 * still counts every value.
 */
export interface AttributeRow {
  name: string;
  scope: "case" | "event";
  summaries: Record<string, Summary>;
  test: Test | null;
}

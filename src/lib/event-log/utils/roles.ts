import type { ColumnGranularity, ColumnRole, ColumnType } from "$lib/event-log/invokers/types";

// Roles assignable in the "Required fields" step. Every other ColumnRole —
// "other" — has no picker; unassigned columns fall through to "other".
export type AssignableRole = Extract<
  ColumnRole,
  "case_id" | "activity_name" | "complete_timestamp" | "start_timestamp"
>;

// Required roles gate moving past step 2. start_timestamp is optional, so
// it's excluded from that gate but still auto-activates after the others.
export const requiredRoles: AssignableRole[] = ["case_id", "activity_name", "complete_timestamp"];
export const roleOrder: AssignableRole[] = [...requiredRoles, "start_timestamp"];

export const roleMeta: Record<
  AssignableRole,
  { step: number; label: string; hint: string; optional?: boolean }
> = {
  case_id: { step: 1, label: "Case ID", hint: "Groups events into a single process instance" },
  activity_name: { step: 2, label: "Activity", hint: "The step or action performed" },
  complete_timestamp: {
    step: 3,
    label: "Complete timestamp",
    hint: "When the activity finished"
  },
  start_timestamp: {
    step: 4,
    label: "Start timestamp",
    hint: "When the activity started",
    optional: true
  }
};

export function emptyAssignments(): Record<AssignableRole, string | null> {
  return { case_id: null, activity_name: null, complete_timestamp: null, start_timestamp: null };
}

// Granularity and data type for required/start-timestamp roles are fixed by
// what the role means — the app sets them, not the user.
export const requiredFieldSettings: Record<
  AssignableRole,
  { granularity: ColumnGranularity; type: ColumnType }
> = {
  case_id: { granularity: "case", type: "string" },
  activity_name: { granularity: "event", type: "string" },
  complete_timestamp: { granularity: "event", type: "datetime" },
  start_timestamp: { granularity: "event", type: "datetime" }
};

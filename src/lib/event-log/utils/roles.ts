import type { ColumnGranularity, ColumnRole, ColumnType } from "$lib/event-log/invokers/types";
import type { LucideIcon } from "@lucide/svelte";
import Tag from "@lucide/svelte/icons/tag";
import Mail from "@lucide/svelte/icons/mail";
import Timer from "@lucide/svelte/icons/timer";
import ClockCheck from "@lucide/svelte/icons/clock-check";

// Roles assignable in the "Required fields" step. Unassigned columns fall
// through to "other", which has no picker.
export type AssignableRole = Extract<
  ColumnRole,
  "case_id" | "activity_name" | "complete_timestamp" | "start_timestamp"
>;

// Required roles gate moving past step 2. start_timestamp is optional, so it
// is excluded from that gate.
export const requiredRoles: AssignableRole[] = ["case_id", "activity_name", "complete_timestamp"];
export const roleOrder: AssignableRole[] = [...requiredRoles, "start_timestamp"];

// Timer and ClockCheck are the pair that tells the two timestamps apart: a
// stopwatch running for the one that opens the activity, a clock with a tick
// for the one that closes it.
export const roleMeta: Record<
  AssignableRole,
  { icon: LucideIcon; label: string; hint: string; optional?: boolean }
> = {
  case_id: { icon: Tag, label: "Case ID", hint: "Groups events into a single process instance" },
  activity_name: { icon: Mail, label: "Activity", hint: "The step or action performed" },
  complete_timestamp: {
    icon: ClockCheck,
    label: "Complete timestamp",
    hint: "When the activity finished"
  },
  start_timestamp: {
    icon: Timer,
    label: "Start timestamp",
    hint: "When the activity started",
    optional: true
  }
};

export function emptyAssignments(): Record<AssignableRole, string | null> {
  return { case_id: null, activity_name: null, complete_timestamp: null, start_timestamp: null };
}

// Granularity and data type for required/start-timestamp roles are fixed by
// what the role means. The app sets them, not the user.
export const requiredFieldSettings: Record<
  AssignableRole,
  { granularity: ColumnGranularity; type: ColumnType }
> = {
  case_id: { granularity: "case", type: "string" },
  activity_name: { granularity: "event", type: "string" },
  complete_timestamp: { granularity: "event", type: "datetime" },
  start_timestamp: { granularity: "event", type: "datetime" }
};

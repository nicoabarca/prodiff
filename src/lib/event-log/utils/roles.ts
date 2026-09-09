import type { ColumnRole, ColumnScoping, ColumnType } from "$lib/event-log/invokers/types";
import type { LucideIcon } from "@lucide/svelte";
import Tag from "@lucide/svelte/icons/tag";
import Mail from "@lucide/svelte/icons/mail";
import Timer from "@lucide/svelte/icons/timer";
import ClockCheck from "@lucide/svelte/icons/clock-check";
import Asterisk from "@lucide/svelte/icons/asterisk";

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

// Scope, resolution and data type for required/start-timestamp roles are fixed
// by what the role means. The app sets them, not the user.
export const requiredFieldSettings: Record<
  AssignableRole,
  { scoping: ColumnScoping; type: ColumnType }
> = {
  case_id: { scoping: { scope: "case", caseResolution: "constant" }, type: "string" },
  activity_name: { scoping: { scope: "event" }, type: "string" },
  complete_timestamp: { scoping: { scope: "event" }, type: "datetime" },
  start_timestamp: { scoping: { scope: "event" }, type: "datetime" }
};

/**
 * What a column click can be aimed at: one of the roles, or `other`, the
 * catch-all for extra columns kept in the analysis without a role of their own.
 */
export type ColumnPick = AssignableRole | "other";

export const pickOrder: ColumnPick[] = [...roleOrder, "other"];

export const pickMeta: Record<
  ColumnPick,
  { icon: LucideIcon; label: string; hint: string; optional?: boolean }
> = {
  ...roleMeta,
  other: {
    icon: Asterisk,
    label: "Other fields",
    hint: "Extra columns to keep in the analysis",
    optional: true
  }
};

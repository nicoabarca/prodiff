/**
 * Which activities and edges the Display panel's Focus fades. Fading only
 * lowers what is drawn: nothing is removed, rebuilt or placed again.
 */
import type { Counts } from "$lib/dfg/invokers/types";
import type { GroupFocus } from "$lib/tree/types";

/**
 * Whether a place stays at full strength under `focus`: always for `"all"`,
 * where every compared Group reaches it for `"shared"`, and where that Group
 * does for a Group's id. A Group no longer compared fades nothing.
 */
export function emphasized(
  counts: Record<string, Counts>,
  focus: GroupFocus,
  groupIds: string[]
): boolean {
  const reaches = (id: string) => (counts[id]?.cases ?? 0) > 0;
  if (focus === "all") return true;
  if (focus === "shared") return groupIds.every(reaches);
  return !groupIds.includes(focus) || reaches(focus);
}

/**
 * Whether a place is faded: outside the Group focused on, or without a
 * significant finding while only those are asked for.
 */
export function faded(
  place: { counts: Record<string, Counts>; finding: boolean },
  view: { emphasis: GroupFocus; findingsOnly: boolean },
  groupIds: string[]
): boolean {
  return (
    !emphasized(place.counts, view.emphasis, groupIds) || (view.findingsOnly && !place.finding)
  );
}

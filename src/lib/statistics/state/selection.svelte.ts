import { allGroups, isApplied } from "$lib/groups/state/groups.svelte";
import type { Group } from "$lib/groups/types";

/**
 * The two Groups the Statistics view sets side by side, in memory per project.
 * `null` in the second slot shows the first alone.
 */
const picked = $state<Record<string, [string, string | null]>>({});

/** Every Group the pickers offer: the applied ones, the Original first. */
export function pickable(projectId: string): Group[] {
  return allGroups(projectId).filter(isApplied);
}

/**
 * The Groups on screen, in order. A pick that is gone or no longer applied falls
 * back to the Original, then to the first other applied Group.
 */
export function statisticsGroups(projectId: string): Group[] {
  const options = pickable(projectId);
  const find = (id: string | null) => options.find((group) => group.id === id) ?? null;
  const [first, second] = picked[projectId] ?? [options[0].id, options[1]?.id ?? null];
  const a = find(first) ?? options[0];
  const b = picked[projectId] ? find(second) : (options.find((group) => group.id !== a.id) ?? null);
  return b && b.id !== a.id ? [a, b] : [a];
}

/** Puts a Group in one slot. Picking what the other slot holds swaps them. */
export function pickGroup(projectId: string, slot: 0 | 1, id: string | null) {
  const [a, b] = statisticsGroups(projectId);
  let first = a.id;
  let second: string | null = b?.id ?? null;
  if (slot === 0 && id !== null) {
    if (id === second) second = first;
    first = id;
  }
  if (slot === 1) {
    if (id === first) {
      const other = b?.id;
      if (!other) return;
      first = other;
    }
    second = id;
  }
  picked[projectId] = [first, second];
}

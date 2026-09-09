import { filtersKey } from "$lib/groups/state/groups.svelte";
import type { Group } from "$lib/groups/types";
import type { TreeSettings } from "$lib/tree/types";

/**
 * Identifies the numbers a build produces, for the in-memory cache. Each Group
 * carries its Filter List with it, so a Group re-applied under a different list
 * reads as a different tree. Variants are sorted, so checking them in a
 * different order doesn't.
 */
export function treeKey(groups: Group[], settings: TreeSettings): string {
  const fingerprints = groups.map((group) => `${group.id}:${filtersKey(group.filters)}`);
  return JSON.stringify([fingerprints, settings.attributes, [...settings.selectedVariants].sort()]);
}

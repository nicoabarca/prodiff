import { filtersKey } from "$lib/filters/utils/key";
import type { Group } from "$lib/groups/types";
import type { TreeSettings } from "$lib/tree/types";

export function groupKey(group: Pick<Group, "id" | "filters">): string {
  return `${group.id}:${filtersKey(group.filters)}`;
}

export function treeKeyFromGroupKeys(groupKeys: string[], settings: TreeSettings): string {
  return JSON.stringify([groupKeys, settings.attributes, [...settings.selectedVariants].sort()]);
}

export function treeKey(groups: Group[], settings: TreeSettings): string {
  return treeKeyFromGroupKeys(groups.map(groupKey), settings);
}

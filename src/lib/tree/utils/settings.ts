import type { TreeSettings } from "$lib/tree/types";

/**
 * Identifies the numbers a build produces, for the in-memory cache. Sorted, so
 * checking Variants in a different order doesn't read as a different tree.
 */
export function treeKey(groups: string[], settings: TreeSettings): string {
  return JSON.stringify([groups, settings.attributes, [...settings.selectedVariants].sort()]);
}

import type { TreeSettings } from "$lib/tree/types";

/** The tree a set of inputs builds: what is compared (`comparisonKey()`) and the settings. */
export function treeKey(comparisonKey: string, settings: TreeSettings): string {
  return JSON.stringify([
    comparisonKey,
    settings.attributes,
    [...settings.selectedVariants].sort()
  ]);
}

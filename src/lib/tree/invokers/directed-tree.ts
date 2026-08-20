import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
import type { TreeSettings } from "$lib/tree/types";

/**
 * Builds the tree. Both chains arrive already composed (base first) — the
 * ordering rule lives in `effectiveChain`, as it does for every other command.
 * `groupB` is `null` in one-Group mode, where nothing is compared.
 *
 * `settings.selectedVariants` is which Variants to include, by key. The cut
 * runs before anything is aggregated, so every Significance Test describes the
 * Variants asked for — an empty set sends `null`, which lets the backend open
 * on the ones covering most of the cases.
 */
export function directedTree(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null,
  settings: TreeSettings
): Promise<ResponseDirectedTree> {
  return invoke<ResponseDirectedTree>("directed_tree", {
    projectId: project.id,
    groupA,
    groupB,
    attributes: settings.attributes,
    columns: project.columns,
    variants: settings.selectedVariants.length > 0 ? settings.selectedVariants : null
  });
}

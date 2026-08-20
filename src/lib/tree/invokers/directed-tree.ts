import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
import type { TreeSettings } from "$lib/tree/types";

/**
 * Builds the tree. Both chains arrive already composed by `effectiveChain`,
 * base first; `groupB` is `null` in one-Group mode.
 *
 * `settings.selectedVariants` is cut before anything is aggregated, so every
 * Significance Test describes exactly those Variants. An empty set sends
 * `null`, letting the backend open on the ones covering most of the cases.
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

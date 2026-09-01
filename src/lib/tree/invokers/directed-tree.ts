import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
import type { TreeSettings } from "$lib/tree/types";

/**
 * Builds the tree from the Groups' materialized Parquet files. `groups` is
 * ordered and holds one or two ids; one is single-Group mode, which renders
 * case counts and aggregates but no comparison.
 *
 * `settings.selectedVariants` is cut before anything is aggregated, so every
 * Significance Test describes exactly those Variants. An empty set sends
 * `null`, letting the backend open on the ones covering most of the cases.
 */
export function directedTree(
  project: Project,
  groups: string[],
  settings: TreeSettings
): Promise<ResponseDirectedTree> {
  return invoke<ResponseDirectedTree>("directed_tree", {
    projectId: project.id,
    groups,
    attributes: settings.attributes,
    columns: project.columns,
    variants: settings.selectedVariants.length > 0 ? settings.selectedVariants : null
  });
}

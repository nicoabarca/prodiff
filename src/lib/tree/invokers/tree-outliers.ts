import { invoke } from "@tauri-apps/api/core";
import type { Outliers } from "$lib/analysis/types";
import type { Project } from "$lib/event-log/types";
import type { RequestTreeOutlierTarget } from "$lib/tree/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** The values past the whiskers of one box plot the tree draws, keyed by Group id. */
export function treeOutliers(
  project: Project,
  groups: string[],
  target: RequestTreeOutlierTarget
): Promise<Record<string, Outliers>> {
  return invoke<Record<string, Outliers>>("tree_outliers", {
    projectId: project.id,
    groups,
    columns: analysisColumns(project),
    target
  });
}

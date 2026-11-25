import { invoke } from "@tauri-apps/api/core";
import type { AdjustedBox } from "$lib/analysis/types";
import type { Project } from "$lib/event-log/types";
import type { RequestTreeOutlierTarget } from "$lib/tree/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** The adjusted box plot of one box plot the tree draws, keyed by Group id. */
export function treeAdjustedBox(
  project: Project,
  groups: string[],
  target: RequestTreeOutlierTarget
): Promise<Record<string, AdjustedBox>> {
  return invoke<Record<string, AdjustedBox>>("tree_adjusted_box", {
    projectId: project.id,
    groups,
    columns: analysisColumns(project),
    target
  });
}

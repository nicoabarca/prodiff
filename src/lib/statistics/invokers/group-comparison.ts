import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** Durations, activities and attribute columns of one or two Groups, in the order given. */
export function groupComparison(
  project: Project,
  groups: string[],
  attributes: string[]
): Promise<ResponseGroupComparison> {
  return invoke<ResponseGroupComparison>("group_comparison", {
    projectId: project.id,
    groups,
    columns: analysisColumns(project),
    attributes
  });
}

import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseRelation } from "$lib/groups/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** How two Groups relate, read from their case columns only. */
export function comparisonRelation(
  project: Project,
  groupIds: string[]
): Promise<ResponseRelation> {
  return invoke<ResponseRelation>("comparison_relation", {
    projectId: project.id,
    groupIds,
    columns: analysisColumns(project)
  });
}

import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** Cases present in every one of the Groups. Reported, never removed. */
export function fetchSharedCases(project: Project, groupIds: string[]): Promise<number> {
  return invoke<number>("shared_cases", {
    projectId: project.id,
    groupIds,
    columns: analysisColumns(project)
  });
}

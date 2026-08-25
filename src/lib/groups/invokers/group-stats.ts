import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/**
 * Statistics for several Groups at once, in the order asked. Batched
 * deliberately: the Statistics view wants every Group on each render.
 */
export function groupStats(project: Project, groupIds: string[]): Promise<ResponseEventLogStats[]> {
  return invoke<ResponseEventLogStats[]>("group_stats", {
    projectId: project.id,
    groupIds,
    columns: project.columns
  });
}

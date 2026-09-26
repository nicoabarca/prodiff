import { invoke } from "@tauri-apps/api/core";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Group } from "$lib/groups/types";
import type { ResponseCreateSampleProject } from "$lib/sample-project/invokers/types";

/**
 * Imports the bundled sample Event Log under `projectId`, replacing whatever
 * was there, and applies `groups` to it in order.
 */
export function createSampleProject(
  projectId: string,
  columns: RequestColumnMapping[],
  groups: Pick<Group, "id" | "filters">[]
): Promise<ResponseCreateSampleProject> {
  return invoke<ResponseCreateSampleProject>("create_sample_project", {
    projectId,
    columns,
    groups
  });
}

import { invoke } from "@tauri-apps/api/core";
import type {
  RequestCustomAttribute,
  ResponseEmptyCount
} from "$lib/custom-attributes/invokers/types";
import type { Project } from "$lib/event-log/types";

/**
 * Writes `set` into, and drops `remove` from, the Event Log and every applied
 * Group among `groupIds`. Returns each written attribute's empty count.
 */
export function updateCustomAttributes(
  project: Project,
  set: RequestCustomAttribute[],
  remove: string[],
  groupIds: string[]
): Promise<ResponseEmptyCount[]> {
  return invoke<ResponseEmptyCount[]>("update_custom_attributes", {
    projectId: project.id,
    set,
    remove,
    groupIds,
    columns: project.columns
  });
}

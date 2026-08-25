import { invoke } from "@tauri-apps/api/core";

/** Whether each Group has a Parquet, in the order asked. */
export function appliedGroups(projectId: string, groupIds: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("applied_groups", { projectId, groupIds });
}

import { invoke } from "@tauri-apps/api/core";

/**
 * Whether each Group has a Parquet, in the order asked. A row whose file is
 * missing is not corrupt — it is unmaterialized, and re-applying fixes it.
 */
export function appliedGroups(projectId: string, groupIds: string[]): Promise<boolean[]> {
  return invoke<boolean[]>("applied_groups", { projectId, groupIds });
}

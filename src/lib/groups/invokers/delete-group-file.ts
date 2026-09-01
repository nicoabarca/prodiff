import { invoke } from "@tauri-apps/api/core";

/** Drops a Group's Parquet. */
export function deleteGroupFile(projectId: string, groupId: string): Promise<void> {
  return invoke<void>("delete_group_file", { projectId, groupId });
}

import { invoke } from "@tauri-apps/api/core";

/**
 * Drops a Group's Parquet. Called before its row, so a failure here leaves
 * both halves in place rather than a row pointing at nothing.
 */
export function deleteGroupFile(projectId: string, groupId: string): Promise<void> {
  return invoke<void>("delete_group_file", { projectId, groupId });
}

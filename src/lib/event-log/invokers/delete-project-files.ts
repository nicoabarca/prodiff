import { invoke } from "@tauri-apps/api/core";

/** Removes a project's parsed Event Log and its copy of the original upload. */
export function deleteProjectFiles(projectId: string): Promise<void> {
  return invoke("delete_project_files", { projectId });
}

import { invoke } from "@tauri-apps/api/core";
import type {
  RequestImportProject,
  ResponseImportProject
} from "$lib/project-import/invokers/types";

/**
 * Builds the Project `projectId` from the CSV at `csvPath`: imports it, writes
 * the Custom Attributes, applies the Groups in order. The Project's files are
 * replaced only if every step succeeds.
 */
export function importProject(
  projectId: string,
  csvPath: string,
  input: RequestImportProject
): Promise<ResponseImportProject> {
  return invoke<ResponseImportProject>("import_project", { projectId, csvPath, input });
}

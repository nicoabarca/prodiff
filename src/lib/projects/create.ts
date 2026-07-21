import { invoke } from "@tauri-apps/api/core";
import { addProject } from "$lib/state/projects.svelte";
import { validateColumnMapping, type ColumnMapping } from "$lib/column-mapping";
import type { Project } from "$lib/types";

/** The uploaded file awaiting confirmation, as held by the new-project flow. */
export interface ProjectDraft {
  filePath: string;
  fileName: string;
}

/** Statistics computed by the Rust side while writing the Event Log. */
type EventLogStats = Pick<
  Project,
  "events" | "cases" | "activities" | "variants" | "timespanStart" | "timespanEnd"
>;

function deriveProjectName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/**
 * Creates a Project from a confirmed Column Mapping: writes the Event Log to
 * disk, computes its statistics, and persists the project record. Returns the
 * stored Project. Throws if the mapping is invalid or the event log can't be
 * parsed — nothing is persisted in that case.
 */
export async function createProject(
  draft: ProjectDraft,
  columns: ColumnMapping[]
): Promise<Project> {
  validateColumnMapping(
    columns,
    columns.map((c) => c.name)
  );

  const id = crypto.randomUUID();
  const stats = await invoke<EventLogStats>("create_event_log", {
    projectId: id,
    sourcePath: draft.filePath,
    columns
  });

  const project: Project = {
    id,
    name: deriveProjectName(draft.fileName),
    fileName: draft.fileName,
    columns,
    hiddenColumns: [],
    createdAt: new Date().toISOString(),
    ...stats
  };

  await addProject(project);
  return project;
}

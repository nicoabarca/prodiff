import { invoke } from "@tauri-apps/api/core";
import { addProject } from "$lib/state/projects.svelte";
import { validateColumnMapping, type ColumnMapping } from "$lib/column-mapping";
import type { Project } from "$lib/types";

/** The uploaded file awaiting confirmation, as held by the new-project flow. */
export interface ProjectDraft {
  filePath: string;
  fileName: string;
}

/**
 * Result of writing the Event Log: stats plus where the files ended up on disk.
 * Rust returns the full `EventLogStats` — the per-case metrics beyond these are
 * recomputed per population by the Statistics view rather than stored on the
 * project, so they are picked off here instead of spread into the row.
 */
type CreateEventLogResult = Pick<
  Project,
  | "events"
  | "cases"
  | "activities"
  | "variants"
  | "timespanStart"
  | "timespanEnd"
  | "originalPath"
  | "eventLogPath"
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
  columns: ColumnMapping[],
  hiddenColumns: string[] = []
): Promise<Project> {
  validateColumnMapping(
    columns,
    columns.map((c) => c.name)
  );

  const id = crypto.randomUUID();
  const result = await invoke<CreateEventLogResult>("create_event_log", {
    projectId: id,
    sourcePath: draft.filePath,
    columns
  });

  const project: Project = {
    id,
    name: deriveProjectName(draft.fileName),
    fileName: draft.fileName,
    columns,
    hiddenColumns,
    createdAt: new Date().toISOString(),
    events: result.events,
    cases: result.cases,
    activities: result.activities,
    variants: result.variants,
    timespanStart: result.timespanStart,
    timespanEnd: result.timespanEnd,
    originalPath: result.originalPath,
    eventLogPath: result.eventLogPath
  };

  await addProject(project);
  return project;
}

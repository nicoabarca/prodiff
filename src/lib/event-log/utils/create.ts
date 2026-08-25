import { createEventLog } from "$lib/event-log/invokers/create-event-log";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import { addProject } from "$lib/event-log/state/projects.svelte";
import type { Project, ProjectDraft } from "$lib/event-log/types";
import { validateColumnMapping } from "$lib/event-log/utils/column-mapping";

function deriveProjectName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/**
 * Creates a Project from a confirmed Column Mapping: writes the Event Log to
* disk, computes its statistics, and persists the project record. Throws if the
* mapping is invalid or the event log cannot be parsed, persisting nothing.
 */
export async function createProject(
  draft: ProjectDraft,
  columns: RequestColumnMapping[],
  hiddenColumns: string[] = []
): Promise<Project> {
  validateColumnMapping(
    columns,
    columns.map((c) => c.name)
  );

  const id = crypto.randomUUID();
  const result = await createEventLog(id, draft.filePath, columns);

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

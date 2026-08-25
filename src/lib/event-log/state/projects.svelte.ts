import { eq } from "drizzle-orm";
import { page } from "$app/state";
import { db } from "$lib/db/client";
import { projects as projectsTable } from "$lib/db/schema";
import { deleteProjectFiles } from "$lib/event-log/invokers/delete-project-files";
import type { Project } from "$lib/event-log/types";
import { removeGroupsForProject } from "$lib/groups/state/groups.svelte";

export const projects = $state<Project[]>([]);
export const projectsLoaded = $state<{ value: boolean }>({ value: false });

/**
 * The project the current route addresses, or `null` while the list is still
 * loading, or if the id doesn't exist. Call inside a `$derived`.
 */
export function currentProject(): Project | null {
  return projects.find((p) => p.id === page.params.id) ?? null;
}

export async function loadProjects() {
  const rows = await db().select().from(projectsTable).orderBy(projectsTable.createdAt);
  projects.splice(0, projects.length, ...rows.reverse());
  projectsLoaded.value = true;
}

export async function addProject(project: Project) {
  await db().insert(projectsTable).values(project);
  projects.unshift(project);
}

/**
 * Persists an edit to a project and reflects it in the loaded array. Used by
 * the event log settings — renaming, and re-declaring what a column means.
 */
export async function updateProject(id: string, changes: Partial<Project>) {
  await db().update(projectsTable).set(changes).where(eq(projectsTable.id, id));
  const project = projects.find((p) => p.id === id);
  if (project) Object.assign(project, changes);
}

export async function removeProject(id: string) {
  await deleteProjectFiles(id);
  await removeGroupsForProject(id);
  await db().delete(projectsTable).where(eq(projectsTable.id, id));
  const index = projects.findIndex((p) => p.id === id);
  if (index !== -1) projects.splice(index, 1);
}

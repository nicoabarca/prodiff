import { eq } from "drizzle-orm";
import { invoke } from "@tauri-apps/api/core";
import { db } from "$lib/db/client";
import { projects as projectsTable } from "$lib/db/schema";
import type { Project } from "$lib/types";

export const projects = $state<Project[]>([]);
export const projectsLoaded = $state<{ value: boolean }>({ value: false });

export async function loadProjects() {
  const rows = await db().select().from(projectsTable).orderBy(projectsTable.createdAt);
  projects.splice(0, projects.length, ...rows.reverse());
  projectsLoaded.value = true;
}

export async function addProject(project: Project) {
  await db().insert(projectsTable).values(project);
  projects.unshift(project);
}

export async function removeProject(id: string) {
  await invoke("delete_project_files", { projectId: id });
  await db().delete(projectsTable).where(eq(projectsTable.id, id));
  const index = projects.findIndex((p) => p.id === id);
  if (index !== -1) projects.splice(index, 1);
}

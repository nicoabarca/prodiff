import { eq } from "drizzle-orm";
import { invoke } from "@tauri-apps/api/core";
import { db } from "$lib/db/client";
import { projects as projectsTable } from "$lib/db/schema";
import type { ColumnMapping } from "$lib/column-mapping";
import type { Project } from "$lib/types";

export const projects = $state<Project[]>([]);
export const projectsLoaded = $state<{ value: boolean }>({ value: false });

export const draftUpload = $state<{ filePath: string | null; fileName: string | null }>({
  filePath: null,
  fileName: null
});

function toProject(row: typeof projectsTable.$inferSelect): Project {
  return {
    ...row,
    columns: JSON.parse(row.columns) as ColumnMapping[],
    hiddenColumns: JSON.parse(row.hiddenColumns) as string[]
  };
}

export async function loadProjects() {
  const rows = await db().select().from(projectsTable).orderBy(projectsTable.createdAt);
  projects.splice(0, projects.length, ...rows.map(toProject).reverse());
  projectsLoaded.value = true;
}

export async function addProject(project: Project) {
  await db()
    .insert(projectsTable)
    .values({
      ...project,
      columns: JSON.stringify(project.columns),
      hiddenColumns: JSON.stringify(project.hiddenColumns)
    });
  projects.unshift(project);
}

export async function removeProject(id: string) {
  await invoke("delete_project_files", { projectId: id });
  await db().delete(projectsTable).where(eq(projectsTable.id, id));
  const index = projects.findIndex((p) => p.id === id);
  if (index !== -1) projects.splice(index, 1);
}

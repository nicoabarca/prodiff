import {
  addCustomAttributes,
  removeCustomAttributesForProject
} from "$lib/custom-attributes/state/custom-attributes.svelte";
import { deleteSettings as deleteDfgSettings } from "$lib/dfg/state/variants.svelte";
import { addProject, forgetProjectRow, projects } from "$lib/event-log/state/projects.svelte";
import type { Project } from "$lib/event-log/types";
import { deleteComparison } from "$lib/groups/state/comparison.svelte";
import { addGroups, removeGroupsForProject } from "$lib/groups/state/groups.svelte";
import { deleteSavedComparisonsForProject } from "$lib/groups/state/saved-comparisons.svelte";
import { importProject } from "$lib/project-import/invokers/import-project";
import { openBundle } from "$lib/project-import/invokers/open-bundle";
import type { ResolvedManifest } from "$lib/project-import/types";
import {
  importedProjectId,
  importedRows,
  ManifestError,
  readManifest,
  resolveManifest
} from "$lib/project-import/utils/manifest";
import { deleteSettings as deleteTreeSettings } from "$lib/tree/state/tree.svelte";

/** A bundle read and checked, with nothing written yet. */
export interface PreparedImport {
  projectId: string;
  resolved: ResolvedManifest;
  csvPath: string;
  csvFileName: string;
  replaces: boolean;
}

export interface ImportedProject {
  project: Project;
  groups: number;
}

/** What a failed import shows: one sentence to act on, and the error itself. */
export interface ImportFailure {
  sentence: string;
  detail: string;
}

/** Thrown by `prepareImport` when the bundle cannot be opened or read. */
class UnreadableBundle extends Error {}

/**
 * Opens the bundle at `path`, reads and resolves its manifest, and says whether
 * importing it would replace a Project. Writes nothing.
 */
export async function prepareImport(path: string): Promise<PreparedImport> {
  let opened;
  try {
    opened = await openBundle(path);
  } catch (error) {
    throw new UnreadableBundle(String(error));
  }
  const manifest = readManifest(opened.manifestText);
  const resolved = resolveManifest(manifest);
  const projectId = importedProjectId(resolved.name);
  return {
    projectId,
    resolved,
    csvPath: opened.csvPath,
    csvFileName: opened.csvFileName,
    replaces: projects.some((project) => project.id === projectId)
  };
}

/** Every row a Project owns. Its files stay. */
async function forgetRows(projectId: string) {
  await removeCustomAttributesForProject(projectId);
  await removeGroupsForProject(projectId);
  await deleteSavedComparisonsForProject(projectId);
  await deleteComparison(projectId);
  await deleteTreeSettings(projectId);
  await deleteDfgSettings(projectId);
  await forgetProjectRow(projectId);
}

/**
 * Builds the prepared Project's files, replacing the old ones only if every
 * step succeeds, then replaces its rows.
 */
export async function runImport(prepared: PreparedImport): Promise<ImportedProject> {
  const { projectId, resolved } = prepared;
  const built = await importProject(projectId, prepared.csvPath, {
    columns: resolved.columns,
    customAttributes: resolved.customAttributes.map(({ id, formula }) => ({ id, formula })),
    groups: resolved.groups.map(({ id, filters }) => ({ id, filters }))
  });
  const rows = importedRows(
    projectId,
    resolved,
    built,
    prepared.csvFileName,
    new Date().toISOString()
  );
  await forgetRows(projectId);
  await addProject(rows.project);
  await addCustomAttributes(rows.customAttributes);
  await addGroups(rows.groups);
  return { project: rows.project, groups: rows.groups.length };
}

export function importFailure(error: unknown): ImportFailure {
  const detail = error instanceof Error ? error.message : String(error);
  if (
    error instanceof UnreadableBundle ||
    (error instanceof ManifestError && error.kind === "unreadable")
  ) {
    return {
      sentence: "This is not the study file. Download study.zip again and pick it.",
      detail
    };
  }
  if (error instanceof ManifestError) {
    return { sentence: "Update ProDiff and try again.", detail };
  }
  return {
    sentence: "The study file could not be imported. Send this message to the researcher.",
    detail
  };
}

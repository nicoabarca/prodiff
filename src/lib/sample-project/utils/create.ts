import { addProject, projects, removeProject } from "$lib/event-log/state/projects.svelte";
import type { Project } from "$lib/event-log/types";
import { defaultColor } from "$lib/groups/colors";
import { saveComparison } from "$lib/groups/state/comparison.svelte";
import { addGroups } from "$lib/groups/state/groups.svelte";
import type { Group } from "$lib/groups/types";
import { groupId } from "$lib/groups/utils/group-id";
import { createSampleProject as importSampleProject } from "$lib/sample-project/invokers/create-sample-project";
import {
  SAMPLE_MANIFEST,
  SAMPLE_PROJECT_ID,
  type SampleManifest
} from "$lib/sample-project/manifest";
import { saveSettings } from "$lib/tree/state/tree.svelte";

/** Whether the Sample Project exists. Call inside a `$derived`. */
export function hasSampleProject(): boolean {
  return projects.some((project) => project.id === SAMPLE_PROJECT_ID);
}

/**
 * Creates the Sample Project, replacing it if it already exists: imports the
 * bundled Event Log, applies its Groups, and stores the Project, its Groups,
 * the comparison the tree opens on and the attributes the tree tests.
 */
export async function createSampleProject(
  manifest: SampleManifest = SAMPLE_MANIFEST
): Promise<Project> {
  const now = new Date().toISOString();
  const groups: Group[] = manifest.groups.map((group, position) => ({
    id: groupId(),
    projectId: SAMPLE_PROJECT_ID,
    name: group.name,
    color: defaultColor(position),
    position,
    filters: group.filters,
    stats: null,
    createdAt: now,
    editedAt: now
  }));
  const applied = groups.filter((_, index) => manifest.groups[index].applied);
  const comparedIds = manifest.compared.map((name) => {
    const group = applied.find((candidate) => candidate.name === name);
    if (!group) throw new Error(`The sample compares "${name}", which is not an applied Group.`);
    return group.id;
  });

  if (hasSampleProject()) await removeProject(SAMPLE_PROJECT_ID);
  const imported = await importSampleProject(
    SAMPLE_PROJECT_ID,
    manifest.columns,
    applied.map(({ id, filters }) => ({ id, filters }))
  );
  applied.forEach((group, index) => {
    group.stats = imported.groups[index];
  });

  const result = imported.eventLog;
  const project: Project = {
    id: SAMPLE_PROJECT_ID,
    name: manifest.name,
    fileName: manifest.fileName,
    columns: manifest.columns,
    hiddenColumns: [],
    createdAt: now,
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
  await addGroups(groups);
  await saveComparison(SAMPLE_PROJECT_ID, comparedIds);
  await saveSettings(SAMPLE_PROJECT_ID, {
    attributes: manifest.treeAttributes,
    selectedVariants: [],
    attributesChosen: true
  });
  return project;
}

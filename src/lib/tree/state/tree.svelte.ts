import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { treeSettings as settingsTable } from "$lib/db/schema";
import { createVariantSelection } from "$lib/tree/state/variant-selection.svelte";
import {
  type TreeSettings,
  type TreeView,
  defaultTreeSettings,
  defaultTreeView
} from "$lib/tree/types";
import type { Project } from "$lib/event-log/types";

/** Build inputs, persisted per project. Changing either invalidates the tree. */
export const settings = $state<{ projectId: string | null; value: TreeSettings }>({
  projectId: null,
  value: { ...defaultTreeSettings }
});

/**
 * What is hidden, collapsed or dimmed. Nothing here reaches the backend; the one
 * input that does, which Variants to include, lives in `settings`.
 */
export const view = $state<TreeView>({ ...defaultTreeView, collapsed: new Set() });

/**
 * An empty selection is "not chosen yet": the first load re-seeds it from the
 * coverage default, which is the tree a cold build lands on.
 */
const selection = createVariantSelection({
  applied: () => settings.value.selectedVariants,
  persist: (project, keys) =>
    saveSettings(project.id, { ...settings.value, selectedVariants: keys }),
  onEmpty: "coverage"
});

export const { variants, staged, shownVariant } = selection;
export const {
  selectedVariants,
  loadVariants,
  stagedVariants,
  isStagedDirty,
  setStaged,
  toggleStaged,
  resetStaged,
  applyStaged
} = selection;

export async function setSelectedVariants(project: Project, keys: Iterable<string>) {
  await saveSettings(project.id, { ...settings.value, selectedVariants: [...keys] });
}

/** The node whose aggregates the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

export async function loadSettings(projectId: string) {
  const rows = await db()
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.projectId, projectId));
  const row = rows[0];
  settings.projectId = projectId;
  settings.value = row
    ? {
        attributes: row.attributes,
        selectedVariants: row.selectedVariants,
        attributesChosen: row.attributesChosen
      }
    : { ...defaultTreeSettings };
}

export async function saveSettings(projectId: string, value: TreeSettings) {
  const row = {
    projectId,
    attributes: value.attributes,
    selectedVariants: value.selectedVariants,
    attributesChosen: value.attributesChosen
  };
  await db().insert(settingsTable).values(row).onConflictDoUpdate({
    target: settingsTable.projectId,
    set: row
  });
  settings.value = value;
  settings.projectId = projectId;
}
export function resetBuildView() {
  selected.id = null;
  view.collapsed = new Set();
}

export function resetTreeState() {
  resetBuildView();
  selection.reset();
}

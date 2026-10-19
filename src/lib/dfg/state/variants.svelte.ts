import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { dfgSettings as settingsTable } from "$lib/db/schema";
import { defaultDfgSettings, type DfgSettings } from "$lib/dfg/types";
import { reframe } from "$lib/dfg/state/view.svelte";
import { createVariantSelection } from "$lib/tree/state/variant-selection.svelte";
import type { Project } from "$lib/event-log/types";

/** Build inputs, persisted per project. Changing it invalidates the graph. */
export const settings = $state<{ projectId: string | null; value: DfgSettings }>({
  projectId: null,
  value: { ...defaultDfgSettings }
});

/**
 * An empty selection is "not chosen yet": the first load re-seeds it from the
 * coverage default, which is the graph a cold build lands on.
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

/**
 * Where the Behaviour and Paths sliders sit, in memory only. A `coverage` of
 * `null` reads the coverage the staged Variants hold; `applied` is the Paths
 * share the graph on screen was staged with, which Reset returns to.
 */
export const cuts = $state<{ coverage: number | null; paths: number; applied: number }>({
  coverage: null,
  paths: 1,
  applied: 1
});

/** Drops the pending edit and puts both sliders back where the build left them. */
export function resetCuts() {
  resetStaged();
  cuts.coverage = null;
  cuts.paths = cuts.applied;
}

/** Commits the staged Variants, which rebuilds the graph and reframes it. */
export async function applyCuts(project: Project) {
  cuts.applied = cuts.paths;
  cuts.coverage = null;
  await applyStaged(project);
  reframe();
}

export function resetVariantsState() {
  selection.reset();
  cuts.coverage = null;
  cuts.paths = 1;
  cuts.applied = 1;
}

export async function loadSettings(projectId: string) {
  const rows = await db()
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.projectId, projectId));
  const row = rows[0];
  settings.projectId = projectId;
  settings.value = row ? { selectedVariants: row.selectedVariants } : { ...defaultDfgSettings };
}

export async function saveSettings(projectId: string, value: DfgSettings) {
  const row = { projectId, selectedVariants: value.selectedVariants };
  await db().insert(settingsTable).values(row).onConflictDoUpdate({
    target: settingsTable.projectId,
    set: row
  });
  settings.value = value;
  settings.projectId = projectId;
}

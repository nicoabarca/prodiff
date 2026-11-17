import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { dfgSettings as settingsTable } from "$lib/db/schema";
import { defaultDfgSettings, type DfgSettings } from "$lib/dfg/types";
import { reframe } from "$lib/dfg/state/view.svelte";
import { createVariantSelection } from "$lib/tree/state/variant-selection.svelte";
import { sameSelection, variantsCovering } from "$lib/tree/utils/variants";
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
 * Where the Behaviour and Paths sliders sit, in memory only, both in percent.
 * A `coverage` of `null` reads the coverage the applied Variants hold, which is
 * what a selection picked by hand in the Variants panel leaves it at.
 */
export const cuts = $state<{ coverage: number | null; paths: number }>({
  coverage: null,
  paths: 100
});

/** Moves on each time a slider changes what the graph draws, so the canvas lights what it adds. */
export const flash = $state<{ at: number }>({ at: 0 });

/**
 * Builds the graph from the most common Variants up to `coverage` percent of
 * the cases, dropping any selection picked by hand, and reframes it.
 */
export async function setBehaviour(project: Project, coverage: number) {
  cuts.coverage = coverage;
  const keys = variantsCovering(selection.variants.rows, coverage / 100);
  if (sameSelection(keys, selectedVariants())) return;
  flash.at += 1;
  setStaged(keys);
  await applyStaged(project);
  reframe();
}

export function setPaths(paths: number) {
  if (paths === cuts.paths) return;
  cuts.paths = paths;
  flash.at += 1;
}

/** Commits the Variants staged in the panel, which rebuilds the graph and reframes it. */
export async function applyPicked(project: Project) {
  cuts.coverage = null;
  await applyStaged(project);
  reframe();
}

export function resetVariantsState() {
  selection.reset();
  cuts.coverage = null;
  cuts.paths = 100;
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

export async function deleteSettings(projectId: string) {
  await db().delete(settingsTable).where(eq(settingsTable.projectId, projectId));
  if (settings.projectId === projectId) settings.value = { ...defaultDfgSettings };
}

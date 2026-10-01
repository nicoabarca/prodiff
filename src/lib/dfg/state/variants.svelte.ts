import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { dfgSettings as settingsTable } from "$lib/db/schema";
import { defaultDfgSettings, type DfgSettings } from "$lib/dfg/types";
import { createVariantSelection } from "$lib/tree/state/variant-selection.svelte";

/** Build inputs, persisted per project. Changing it invalidates the graph. */
export const settings = $state<{ projectId: string | null; value: DfgSettings }>({
  projectId: null,
  value: { ...defaultDfgSettings }
});

/**
 * An empty selection is every Variant, so nothing is ever re-seeded: the graph
 * already draws them all before the panel is opened.
 */
const selection = createVariantSelection({
  applied: () => settings.value.selectedVariants,
  persist: (project, keys) =>
    saveSettings(project.id, { ...settings.value, selectedVariants: keys }),
  onEmpty: "all"
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

export const resetVariantsState = selection.reset;

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

import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { treeSettings as settingsTable } from "$lib/db/schema";
import { comparedIds } from "$lib/groups/state/comparison.svelte";
import { listVariants } from "$lib/tree/invokers/list-variants";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";
import {
  DEFAULT_COVERAGE,
  type TreeSettings,
  type TreeView,
  defaultTreeSettings,
  defaultTreeView
} from "$lib/tree/types";
import { sameSelection, variantsCovering } from "$lib/tree/utils/variants";
import type { Filter } from "$lib/filters/kind/filter";
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
 * Every Variant of the current chains, for the panel. Cached by chain key,
 * fetched on first use. One slot.
 */
export const variants = $state<{
  key: string | null;
  rows: ResponseVariantRow[];
  loading: boolean;
  error: string | null;
  /** Selected Variants gone since the last load, for the panel to report. */
  dropped: number;
}>({ key: null, rows: [], loading: false, error: null, dropped: 0 });

/** The Groups the Variant list would have to be built from to still be current. */
function variantsKey(): string {
  return comparedIds().join("|");
}

export function selectedVariants(): Set<string> {
  return new Set(settings.value.selectedVariants);
}

/**
 * Loads the Variant list for the current chains, unless it is already in hand.
 * Keys absent under these chains are dropped and the rest kept; only a
 * selection left with nothing standing is re-seeded from the coverage default.
 */
export async function loadVariants(project: Project, force = false) {
  const key = variantsKey();
  if (variants.loading || (!force && variants.key === key)) return;

  variants.loading = true;
  variants.error = null;
  try {
    const rows = await listVariants(project, comparedIds());
    variants.rows = rows;
    variants.key = key;

    const available = new Set(rows.map((row) => row.key));
    const previous = settings.value.selectedVariants;
    const kept = previous.filter((variantKey) => available.has(variantKey));
    variants.dropped = previous.length - kept.length;
    const next = kept.length > 0 ? kept : [...variantsCovering(rows, DEFAULT_COVERAGE)];
    if (next.length !== previous.length || next.some((k, i) => k !== previous[i])) {
      await saveSettings(project.id, { ...settings.value, selectedVariants: next });
    }
    // A pending edit is pruned the same way, so a Variant that no longer exists
    // leaves the rest of the edit standing.
    if (staged.keys !== null) staged.keys = staged.keys.filter((k) => available.has(k));
  } catch (cause) {
    variants.error = String(cause);
  } finally {
    variants.loading = false;
  }
}

export async function setSelectedVariants(project: Project, keys: Iterable<string>) {
  await saveSettings(project.id, { ...settings.value, selectedVariants: [...keys] });
}

/**
 * The Variant selection being edited, which nothing outside the panel reads:
 * `null` means no edit is pending and the applied selection stands. Only Apply
 * writes it through to `settings`, so staging alone never rebuilds the tree.
 */
export const staged = $state<{ keys: string[] | null }>({ keys: null });

export function stagedVariants(): Set<string> {
  return staged.keys === null ? selectedVariants() : new Set(staged.keys);
}

/** Whether the staged selection differs from the one the settings hold. */
export function isStagedDirty(): boolean {
  return staged.keys !== null && !sameSelection(staged.keys, settings.value.selectedVariants);
}

export function setStaged(keys: Iterable<string>) {
  staged.keys = [...new Set(keys)];
}

/** Stages or unstages one Variant, opening an edit if none was pending. */
export function toggleStaged(variantKey: string) {
  const next = stagedVariants();
  if (!next.delete(variantKey)) next.add(variantKey);
  setStaged(next);
}

/** Drops the pending edit; the applied selection stands again. */
export function resetStaged() {
  staged.keys = null;
}

/** Commits the staged selection, which is what rebuilds the tree. */
export async function applyStaged(project: Project) {
  if (staged.keys === null) return;
  const keys = staged.keys;
  staged.keys = null;
  await saveSettings(project.id, { ...settings.value, selectedVariants: keys });
}

/** The node whose aggregates the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

/** The Variant the canvas lights up: the row that turned it on turns it off. */
export const shownVariant = $state<{ key: string | null }>({ key: null });

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
  variants.key = null;
  variants.rows = [];
  variants.error = null;
  variants.dropped = 0;
  staged.keys = null;
  shownVariant.key = null;
}

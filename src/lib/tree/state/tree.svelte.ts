import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { comparisons as comparisonsTable, treeSettings as settingsTable } from "$lib/db/schema";
import { groups, isApplied, originalGroup } from "$lib/groups/state/groups.svelte";
import { ORIGINAL_ID } from "$lib/groups/types";
import { directedTree } from "$lib/tree/invokers/directed-tree";
import { listVariants } from "$lib/tree/invokers/list-variants";
import type { ResponseDirectedTree, ResponseVariantRow } from "$lib/tree/invokers/types";
import {
  DEFAULT_COVERAGE,
  type TreeSettings,
  type TreeView,
  defaultTreeSettings,
  defaultTreeView
} from "$lib/tree/types";
import { treeKey } from "$lib/tree/utils/settings";
import { sameSelection, variantsCovering } from "$lib/tree/utils/variants";
import type { Filter } from "$lib/filters/kind/filter";
import type { Project } from "$lib/event-log/types";
import type { Group } from "$lib/groups/types";

/**
 * The built tree, in memory only: it survives navigating between views but not a
 * reload. One slot, so switching projects drops the previous tree.
 */
export const built = $state<{
  projectId: string | null;
  key: string | null;
  tree: ResponseDirectedTree | null;
  building: boolean;
  error: string | null;
}>({ projectId: null, key: null, tree: null, building: false, error: null });

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

export function setSelectedVariants(project: Project, keys: Iterable<string>) {
  saveSettings(project.id, { ...settings.value, selectedVariants: [...keys] });
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

/**
 * What the compare modal picked, persisted per project. One or two Group ids,
 * in the order the tree draws them.
 */
export const comparison = $state<{ projectId: string | null; groupIds: string[] }>({
  projectId: null,
  groupIds: []
});

export async function loadComparison(projectId: string) {
  const rows = await db()
    .select()
    .from(comparisonsTable)
    .where(eq(comparisonsTable.projectId, projectId));
  comparison.projectId = projectId;
  comparison.groupIds = rows[0]?.groupIds ?? [];
}

export async function saveComparison(projectId: string, groupIds: string[]) {
  comparison.projectId = projectId;
  comparison.groupIds = groupIds;
  const row = { projectId, groupIds };
  await db().insert(comparisonsTable).values(row).onConflictDoUpdate({
    target: comparisonsTable.projectId,
    set: row
  });
}

/**
 * The Groups being compared: what the modal picked, resolved to the Groups
 * themselves. Only applied Groups can be read, and anything the selection names
 * that has since been deleted or un-applied falls away, so a stale selection
 * degrades to the Original. Capped at two.
 */
export function comparedGroups(): Group[] {
  const projectId = groups[0]?.projectId ?? built.projectId ?? "";
  const original = originalGroup(projectId);
  const known = (id: string): Group | null =>
    id === ORIGINAL_ID
      ? original
      : (groups.find((group) => group.id === id && isApplied(group)) ?? null);

  const picked = comparison.groupIds.map(known).filter((group): group is Group => group !== null);
  return picked.length === 0 ? [original] : picked.slice(0, 2);
}

/** The ids the seam takes: one for a single-Group tree, two for a comparison. */
export function comparedIds(): string[] {
  return comparedGroups().map((group) => group.id);
}

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
  settings.value = value;
  settings.projectId = projectId;
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
}

/** The key the tree on screen would need to match to still be current. */
export function currentKey(): string {
  return treeKey(comparedGroups(), settings.value);
}

export function isStale(): boolean {
  return built.tree !== null && built.key !== currentKey();
}

/**
 * The build whose answer counts. A build started later takes the number, and
 * anything older drops its tree on arrival.
 */
let generation = 0;

/** The key of the last build that failed, which `autoBuild` will not retry. */
let failedKey: string | null = null;

/**
 * Builds the tree for the current Groups, settings and selected Variants. An
 * empty selection lets the backend pick by coverage. Starting a build while one
 * is in flight is allowed: the newer one wins.
 */
export async function build(project: Project) {
  const mine = ++generation;
  const requestedKey = currentKey();
  built.building = true;
  built.error = null;
  failedKey = null;
  try {
    const tree = await directedTree(project, comparedIds(), settings.value);
    if (mine !== generation) return;
    built.projectId = project.id;
    built.tree = tree;
    selected.id = null;
    view.collapsed = new Set();
    // What the backend included, not what was asked for: the ceiling and the
    // log's own Variant count both cut a request short. Adopting it keeps the
    // panel honest about what is actually on screen.
    const includedKeys = tree.nodes
      .map((node) => node.variantKey)
      .filter((key): key is string => key !== null);
    if (includedKeys.length !== settings.value.selectedVariants.length) {
      await saveSettings(project.id, {
        ...settings.value,
        selectedVariants: includedKeys
      });
    }
    // Keyed after the selection lands on the truth, so the tree reads current.
    built.key = currentKey();
  } catch (cause) {
    if (mine !== generation) return;
    built.error = String(cause);
    failedKey = requestedKey;
  } finally {
    if (mine === generation) built.building = false;
  }
}

/**
 * Rebuilds the tree when what it was built from no longer matches what is
 * selected: every trigger commits its edit and this is what notices. The first
 * build is still asked for, and a key that failed waits for the retry.
 */
export function autoBuild(project: Project) {
  if (built.tree === null || built.building) return;
  const key = currentKey();
  if (built.key === key || failedKey === key) return;
  build(project);
}

/** Clears the failure the retry button is showing, and builds again. */
export function retryBuild(project: Project) {
  failedKey = null;
  build(project);
}

function clear() {
  // Anything in flight belongs to the tree being dropped.
  generation += 1;
  failedKey = null;
  built.building = false;
  built.projectId = null;
  built.key = null;
  built.tree = null;
  built.error = null;
  selected.id = null;
  view.collapsed = new Set();
  variants.key = null;
  variants.rows = [];
  variants.error = null;
  variants.dropped = 0;
  staged.keys = null;
  shownVariant.key = null;
}

/** Drops a tree belonging to another project when the route changes. */
export function forgetOtherProject(projectId: string) {
  if (built.projectId && built.projectId !== projectId) clear();
}

/**
 * Drops the tree outright. Called when the Column Mapping changes: type and
 * scope decide which test ran and how it aggregated, so a tree built under the
 * old declarations cannot be reinterpreted.
 */
export function invalidateTree() {
  clear();
}

import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { treeSettings as settingsTable } from "$lib/db/schema";
import { chainKey, effectiveChain, namedSlices } from "$lib/slices/state/slices.svelte";
import { directedTree } from "$lib/tree/invokers/directed-tree";
import { listVariants } from "$lib/tree/invokers/list-variants";
import type { ResponseDirectedTree, ResponseVariantRow } from "$lib/tree/invokers/types";
import { DEFAULT_COVERAGE, type TreeSettings, type TreeView, defaultTreeSettings, defaultTreeView } from "$lib/tree/types";
import { treeKey } from "$lib/tree/utils/settings";
import { variantsCovering } from "$lib/tree/utils/variants";
import type { Filter } from "$lib/filters/filters/filter";
import type { Project } from "$lib/event-log/types";
import type { Slice } from "$lib/slices/types";

/**
 * The built tree, in memory only: it survives navigating between views but
 * not a reload. One slot — switching projects drops the previous tree.
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
 * What is hidden, collapsed or dimmed. Nothing here reaches the backend — the
 * one input that does, which Variants to include, lives in `settings`.
 */
export const view = $state<TreeView>({ ...defaultTreeView, collapsed: new Set() });

/**
 * Every Variant of the current chains, for the picker. Cached by chain key,
 * fetched on first use. One slot.
 */
export const variants = $state<{
  key: string | null;
  rows: ResponseVariantRow[];
  loading: boolean;
  error: string | null;
  /** Selected Variants gone since the last load, for the picker to report. */
  dropped: number;
}>({ key: null, rows: [], loading: false, error: null, dropped: 0 });

/** The chains the Variant list would have to be built from to still be current. */
function variantsKey(): string | null {
  const chains = groupChains();
  return chains ? chainKey([chains.a, chains.b] as unknown as Filter[]) : null;
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
  if (!key || variants.loading || (!force && variants.key === key)) return;

  variants.loading = true;
  variants.error = null;
  try {
    const chains = groupChains();
    if (!chains) return;
    const rows = await listVariants(project, chains.a, chains.b);
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
  } catch (cause) {
    variants.error = String(cause);
  } finally {
    variants.loading = false;
  }
}

/** Checks or unchecks one Variant. Marks the tree stale; the build honours it. */
export function toggleVariant(project: Project, variantKey: string) {
  const next = selectedVariants();
  if (!next.delete(variantKey)) next.add(variantKey);
  saveSettings(project.id, { ...settings.value, selectedVariants: [...next] });
}

export function setSelectedVariants(project: Project, keys: Iterable<string>) {
  saveSettings(project.id, { ...settings.value, selectedVariants: [...keys] });
}

/** The node whose aggregates the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

/**
 * The Variant the canvas lights up. Outlives the picker, so the lit path can
 * be read with the panel closed.
 */
export const shownVariant = $state<{ key: string | null }>({ key: null });

/**
 * Group A and Group B are the two named slices, in position order. Base is
 * never a Group: a slice's chain already contains it, and both Significance
 * Tests assume the two Groups are independent.
 */
export function groupSlices(): [Slice | null, Slice | null] {
  const named = namedSlices();
  return [named[0] ?? null, named[1] ?? null];
}

export function groupChains(): { a: Filter[]; b: Filter[] | null } | null {
  const [a, b] = groupSlices();
  if (!a) return null;
  return { a: effectiveChain(a), b: b ? effectiveChain(b) : null };
}

export async function loadSettings(projectId: string) {
  const rows = await db()
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.projectId, projectId));
  const row = rows[0];
  settings.projectId = projectId;
  settings.value = row
    ? { attributes: row.attributes, selectedVariants: row.selectedVariants }
    : { ...defaultTreeSettings };
}

export async function saveSettings(projectId: string, value: TreeSettings) {
  settings.value = value;
  settings.projectId = projectId;
  const row = {
    projectId,
    attributes: value.attributes,
    selectedVariants: value.selectedVariants
  };
  await db().insert(settingsTable).values(row).onConflictDoUpdate({
    target: settingsTable.projectId,
    set: row
  });
}

/** The key the tree on screen would need to match to still be current. */
export function currentKey(): string | null {
  const chains = groupChains();
  return chains ? treeKey(chains.a, chains.b, settings.value) : null;
}

export function isStale(): boolean {
  return built.tree !== null && built.key !== currentKey();
}

/**
 * Builds the tree for the current Groups, settings and selected Variants.
 * Never automatic — every input here, the Variant selection included, waits
 * for the button. An empty selection lets the backend pick by coverage.
 */
export async function build(project: Project) {
  const chains = groupChains();
  if (!chains || built.building) return;

  built.building = true;
  built.error = null;
  try {
    const tree = await directedTree(project, chains.a, chains.b, settings.value);
    built.projectId = project.id;
    built.tree = tree;
    selected.id = null;
    view.collapsed = new Set();
    // What the backend included, not what was asked for: the ceiling and the
    // log's own Variant count both cut a request short. Adopting it keeps the
    // picker honest about what is actually on screen.
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
    built.error = String(cause);
  } finally {
    built.building = false;
  }
}

function clear() {
  built.projectId = null;
  built.key = null;
  built.tree = null;
  built.error = null;
  selected.id = null;
  view.collapsed = new Set();
  // The Variant list belongs to chains that are no longer current.
  variants.key = null;
  variants.rows = [];
  variants.error = null;
  variants.dropped = 0;
}

/** Drops a tree belonging to another project when the route changes. */
export function forgetOtherProject(projectId: string) {
  if (built.projectId && built.projectId !== projectId) clear();
}

/**
 * Drops the tree outright. Called when the Column Mapping changes: type and
 * granularity decide which test ran and how it aggregated, so a tree built
 * under the old declarations cannot be reinterpreted.
 */
export function invalidateTree() {
  clear();
}

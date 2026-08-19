import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { treeSettings as settingsTable } from "$lib/db/schema";
import { baseSlice, chainKey, effectiveChain, namedSlices } from "$lib/state/slices.svelte";
import {
  DEFAULT_COVERAGE,
  defaultTreeSettings,
  defaultTreeView,
  directedTree,
  listVariants,
  treeKey,
  variantsCovering,
  type DirectedTree,
  type GroupLabels,
  type TreeMode,
  type TreeSettings,
  type TreeView,
  type VariantRow
} from "$lib/tree";
import type { Filter } from "$lib/filters";
import type { Project, Slice } from "$lib/types";

/**
 * The built tree, in memory only. Module-level `$state` like `slices` and
 * `impacts`, so it survives navigating away to another view and back — but not
 * a window reload, which is the right trade for a multi-megabyte payload that
 * Rust can rebuild.
 *
 * One slot: switching projects drops the previous tree rather than keeping
 * every project's in memory at once.
 */
export const built = $state<{
  projectId: string | null;
  key: string | null;
  tree: DirectedTree | null;
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
 * Every Variant of the current chains, for the picker. Cached by chain key and
 * fetched on first use, so a user who never opens the picker never pays for the
 * scan. One slot: the picker only ever shows one project's current chains.
 */
export const variants = $state<{
  key: string | null;
  rows: VariantRow[];
  loading: boolean;
  error: string | null;
  /** Selected Variants gone since the last load, for the picker to report. */
  dropped: number;
}>({ key: null, rows: [], loading: false, error: null, dropped: 0 });

/** The chains the Variant list would have to be built from to still be current. */
function variantsKey(): string {
  const chains = groupChains();
  return chainKey([chains.a, chains.b] as unknown as Filter[]);
}

export function selectedVariants(): Set<string> {
  return new Set(settings.value.selectedVariants);
}

/**
 * Loads the Variant list for the current chains, unless it is already in hand.
 *
 * Reconciles the selection against it: keys that no longer exist under these
 * chains are dropped and the rest kept, so editing a filter costs the user the
 * Variants that genuinely went away rather than their whole curation. Only a
 * selection with nothing left standing is re-seeded from the coverage default.
 */
export async function loadVariants(project: Project, force = false) {
  const key = variantsKey();
  if (variants.loading || (!force && variants.key === key)) return;

  variants.loading = true;
  variants.error = null;
  try {
    const chains = groupChains();
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
 * The Variant the canvas lights up — a row the user clicked in the picker. It
 * outlives the picker itself, so the lit path can be read with the panel out
 * of the way.
 */
export const shownVariant = $state<{ key: string | null }>({ key: null });

/**
 * Group A and Group B are the two named slices, in position order — Base is
 * never a Group. A slice's chain already contains the base chain, so comparing
 * Base against a slice would compare a set with its own subset, which both
 * Significance Tests assume never happens.
 */
export function groupSlices(): [Slice | null, Slice | null] {
  const named = namedSlices();
  return [named[0] ?? null, named[1] ?? null];
}

/**
 * The chains the two Groups are built from. Never null: with no named slice
 * there is still a population to draw — the base chain, or the whole log when
 * there is no base either. `directed_tree` takes `group_b: None` and reads an
 * empty chain as "filter nothing", so all three modes are one call shape.
 */
export function groupChains(): { a: Filter[]; b: Filter[] | null } {
  const [a, b] = groupSlices();
  if (!a) return { a: baseSlice()?.filters ?? [], b: null };
  return { a: effectiveChain(a), b: b ? effectiveChain(b) : null };
}

/**
 * Which of the three modes is on screen. Passed a tree, it describes that
 * drawing rather than the slices as they stand now: deleting a slice leaves a
 * two-Group tree up until the user rebuilds, and a badge flipping to "Base"
 * over a two-coloured canvas would contradict what is drawn. Passed nothing —
 * the empty state, the Build button — it describes what a build would produce.
 */
export function treeMode(tree?: DirectedTree | null): TreeMode {
  if (tree) return tree.groupB ? "compare" : "single";
  const [a, b] = groupSlices();
  if (!a) return "base";
  return b ? "compare" : "single";
}

/**
 * What each Group is called and coloured, in one place — every view used to
 * re-derive this from `groupSlices()` and hardcode `--slice-1` beside it.
 *
 * In base mode the population is not a Group at all, so it takes Base grey
 * rather than Group A's accent; no node can read as "shared" there, since
 * `membership()` only returns it when both Groups have cases.
 */
export function groupLabels(tree?: DirectedTree | null): GroupLabels {
  const mode = treeMode(tree);
  const [a, b] = groupSlices();
  if (mode === "base") {
    return { a: { name: baseSlice() ? "Base" : "Whole log", color: "slice-base" }, b: null };
  }
  const first = { name: a?.name ?? "Group A", color: "slice-1" };
  if (mode === "single") return { a: first, b: null };
  return { a: first, b: { name: b?.name ?? "Group B", color: "slice-2" } };
}

export async function loadSettings(projectId: string) {
  const rows = await db().select().from(settingsTable).where(eq(settingsTable.projectId, projectId));
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
export function currentKey(): string {
  const chains = groupChains();
  return treeKey(chains.a, chains.b, settings.value);
}

export function isStale(): boolean {
  return built.tree !== null && built.key !== currentKey();
}

/**
 * Builds the tree for the current Groups, settings and selected Variants.
 * Always explicit: this is the most expensive operation in the app, the Filters
 * view edits chains live, and the picker checks Variants one click at a time,
 * so anything automatic would fire on every keystroke or checkbox. Every input
 * here — the Variant selection included — waits for the button.
 *
 * An empty selection means the picker has never been opened, so the backend
 * opens on the Variants covering most of the cases.
 */
export async function build(project: Project) {
  const chains = groupChains();
  if (built.building) return;

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
 * Drops the tree outright. Called when the Column Mapping changes: an
 * attribute's type picks which Significance Test ran and its granularity
 * decides whether it aggregated per node or per Group, so a tree built under
 * the old declarations cannot be reinterpreted — only rebuilt.
 */
export function invalidateTree() {
  clear();
}

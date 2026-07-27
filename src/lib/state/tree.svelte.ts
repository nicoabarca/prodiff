import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { treeSettings as settingsTable } from "$lib/db/schema";
import { effectiveChain, namedSlices } from "$lib/state/slices.svelte";
import {
  defaultTreeSettings,
  defaultTreeView,
  directedTree,
  treeKey,
  type DirectedTree,
  type TreeSettings,
  type TreeView
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

/** Pure view state: what is hidden, collapsed or dimmed. Never hits the backend. */
export const view = $state<TreeView>({ ...defaultTreeView, collapsed: new Set() });

/** The node whose aggregates the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

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

export function groupChains(): { a: Filter[]; b: Filter[] | null } | null {
  const [a, b] = groupSlices();
  if (!a) return null;
  return { a: effectiveChain(a), b: b ? effectiveChain(b) : null };
}

export async function loadSettings(projectId: string) {
  const rows = await db().select().from(settingsTable).where(eq(settingsTable.projectId, projectId));
  const row = rows[0];
  settings.projectId = projectId;
  settings.value = row
    ? { attributes: row.attributes, coverage: row.coverage }
    : { ...defaultTreeSettings };
}

export async function saveSettings(projectId: string, value: TreeSettings) {
  settings.value = value;
  settings.projectId = projectId;
  const row = { projectId, attributes: value.attributes, coverage: value.coverage };
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
 * Builds the tree for the current Groups and settings. Explicit rather than
 * automatic: this is the most expensive operation in the app, and the Filters
 * view edits chains live, so an auto-build would fire on every keystroke.
 */
export async function build(project: Project) {
  const chains = groupChains();
  if (!chains || built.building) return;

  built.building = true;
  built.error = null;
  try {
    const tree = await directedTree(project, chains.a, chains.b, settings.value);
    built.projectId = project.id;
    built.key = treeKey(chains.a, chains.b, settings.value);
    built.tree = tree;
    selected.id = null;
    view.collapsed = new Set();
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

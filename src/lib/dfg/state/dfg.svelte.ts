import { dfg } from "$lib/dfg/invokers/dfg";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { dfgKey, GRAPH_ATTRIBUTES } from "$lib/dfg/types";
import { attributeOptions } from "$lib/analysis/attributes";
import { customColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
import { comparedIds } from "$lib/groups/state/comparison.svelte";
import { selected } from "$lib/dfg/state/view.svelte";
import {
  loadVariants,
  resetVariantsState,
  settings as variantSettings
} from "$lib/dfg/state/variants.svelte";
import type { Project } from "$lib/event-log/types";

/**
 * The graph as Rust built it, in memory only: it survives navigating between
 * views but not a reload. One slot, so switching projects drops the previous
 * graph. Nothing here is persisted; the Filter Lists and the Groups already are.
 */
export const built = $state<{
  projectId: string | null;
  key: string | null;
  graph: ResponseDfg | null;
  building: boolean;
  error: string | null;
}>({ projectId: null, key: null, graph: null, building: false, error: null });

/** The attributes each node is asked to measure and test. A build input, so it keys the cache. */
export const selection = $state<{ attributes: string[] }>({ attributes: [] });

/** What the graph can be asked to test: every comparison view's attributes, then its own. */
export function graphAttributeOptions(project: Project): string[] {
  return [
    ...attributeOptions(project.columns, project.hiddenColumns, customColumns(project)),
    ...GRAPH_ATTRIBUTES
  ];
}

/** The selected attributes that are still valid and visible for this project. */
export function selectedAttributes(project: Project): string[] {
  const available = new Set(graphAttributeOptions(project));
  return selection.attributes.filter((attribute) => available.has(attribute));
}

/** The key the graph on screen would need to match to still be current. */
export function currentKey(project: Project): string {
  return dfgKey(comparedIds(), selectedAttributes(project), variantSettings.value.selectedVariants);
}

export function isStale(project: Project | null): boolean {
  return project !== null && built.graph !== null && built.key !== currentKey(project);
}

/**
 * Builds the graph for the Groups, attributes and Variants as they stand, unless
 * it is already in hand. The Variant list is loaded first, which drops keys the
 * Groups no longer hold and seeds an empty selection, so the build is cut to
 * the Variants the panel shows as applied.
 */
export async function load(project: Project, force = false) {
  if (
    built.building ||
    (!force && built.projectId === project.id && built.key === currentKey(project))
  ) {
    return;
  }

  built.building = true;
  built.error = null;
  selected.id = null;
  try {
    await loadVariants(project);
    const attributes = selectedAttributes(project);
    const variants = variantSettings.value.selectedVariants;
    const key = dfgKey(comparedIds(), attributes, variants);
    built.graph = await dfg(project, comparedIds(), attributes, variants);
    built.projectId = project.id;
    built.key = key;
  } catch (cause) {
    built.error = String(cause);
  } finally {
    built.building = false;
  }
}

export function setAttributes(names: string[]) {
  selection.attributes = names;
}

function clear() {
  built.projectId = null;
  built.key = null;
  built.graph = null;
  built.error = null;
}

/** Drops a graph belonging to another project when the route changes. */
export function forgetOtherProject(projectId: string) {
  if (built.projectId && built.projectId !== projectId) {
    clear();
    resetVariantsState();
  }
}

/**
 * Drops the graph outright when Column Mapping type or scope changes.
 */
export function invalidateDfg() {
  clear();
}

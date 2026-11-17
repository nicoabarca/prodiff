import { dfg } from "$lib/dfg/invokers/dfg";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { dfgKey } from "$lib/dfg/types";
import { previewGraph } from "$lib/dfg/utils/preview";
import { attributeOptions } from "$lib/analysis/attributes";
import { customColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
import { comparedIds, comparisonKey, relationReady } from "$lib/groups/state/comparison.svelte";
import { selected } from "$lib/dfg/state/view.svelte";
import {
  loadVariants,
  resetVariantsState,
  selectedVariants,
  settings as variantSettings,
  variants as variantRows
} from "$lib/dfg/state/variants.svelte";
import { sameSelection } from "$lib/tree/utils/variants";
import type { Project } from "$lib/event-log/types";

/**
 * The graph as Rust built it, in memory only: it survives navigating between
 * views but not a reload. One slot, so switching projects drops the previous
 * graph. Nothing here is persisted; the Filter Lists and the Groups already are.
 *
 * `preview` is what a new Variant selection draws, folded in the frontend while
 * Rust builds it, and `null` once the build lands or fails; `testing` is
 * whether that build runs any Significance Test. `comparison` and `variants`
 * are what `graph` was built from.
 */
export const built = $state<{
  projectId: string | null;
  key: string | null;
  comparison: string | null;
  variants: string[];
  graph: ResponseDfg | null;
  preview: ResponseDfg | null;
  testing: boolean;
  building: boolean;
  error: string | null;
}>({
  projectId: null,
  key: null,
  comparison: null,
  variants: [],
  graph: null,
  preview: null,
  testing: false,
  building: false,
  error: null
});

/**
 * The build in flight. A newer request takes `token` over, and an older build
 * that lands afterwards is dropped; `key` is what the newest one was asked for.
 */
let flight: { token: number; key: string | null } = { token: 0, key: null };

/** The graph the canvas draws: the preview while there is one, else the built graph. */
export function drawnGraph(): ResponseDfg | null {
  return built.preview ?? built.graph;
}

/** The attributes each node is asked to measure and test. A build input, so it keys the cache. */
export const selection = $state<{ attributes: string[] }>({ attributes: [] });

/** The selected attributes that are still valid and visible for this project. */
export function selectedAttributes(project: Project): string[] {
  const available = new Set(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );
  return selection.attributes.filter((attribute) => available.has(attribute));
}

/** The key the graph on screen would need to match to still be current. */
export function currentKey(project: Project): string {
  return dfgKey(
    comparisonKey(),
    selectedAttributes(project),
    variantSettings.value.selectedVariants
  );
}

export function isStale(project: Project | null): boolean {
  return project !== null && built.graph !== null && built.key !== currentKey(project);
}

/**
 * Builds the graph for the Groups, attributes and Variants as they stand, unless
 * it is already in hand. The Variant list is loaded first, which drops keys the
 * Groups no longer hold and seeds an empty selection, so the build is cut to
 * the Variants the panel shows as applied. When only the Variants changed, the
 * graph they draw is previewed until the build lands.
 *
 * A request for something else while a build is in flight supersedes it: its
 * preview is drawn at once and the older build's result is dropped.
 */
export async function load(project: Project, force = false) {
  if (!relationReady()) return;
  const wanted = currentKey(project);
  if (!force && built.building && flight.key === wanted) return;
  if (!force && !built.building && built.projectId === project.id && built.key === wanted) {
    return;
  }

  const token = flight.token + 1;
  flight = { token, key: wanted };
  const current = () => flight.token === token;
  built.building = true;
  built.error = null;
  selected.id = null;
  try {
    await loadVariants(project);
    if (!current()) return;
    const attributes = selectedAttributes(project);
    const variants = variantSettings.value.selectedVariants;
    const comparison = comparisonKey();
    const key = dfgKey(comparison, attributes, variants);
    if (
      built.graph &&
      built.projectId === project.id &&
      built.comparison === comparison &&
      !sameSelection(built.variants, variants)
    ) {
      built.preview = previewGraph(variantRows.rows, selectedVariants(), comparedIds());
      built.testing = attributes.length > 0;
    }
    const graph = await dfg(project, comparedIds(), attributes, variants);
    if (!current()) return;
    built.graph = graph;
    built.projectId = project.id;
    built.key = key;
    built.comparison = comparison;
    built.variants = variants;
  } catch (cause) {
    if (current()) built.error = String(cause);
  } finally {
    if (current()) {
      flight.key = null;
      built.preview = null;
      built.building = false;
    }
  }
}

export function setAttributes(names: string[]) {
  selection.attributes = names;
}

function clear() {
  flight = { token: flight.token + 1, key: null };
  built.building = false;
  built.projectId = null;
  built.key = null;
  built.comparison = null;
  built.variants = [];
  built.graph = null;
  built.preview = null;
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

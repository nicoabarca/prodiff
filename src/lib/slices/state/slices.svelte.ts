import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { slices as slicesTable } from "$lib/db/schema";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import { chainImpact } from "$lib/slices/invokers/chain-impact";
import { fetchSharedCases } from "$lib/slices/invokers/shared-cases";
import type { ResponseChainStep, ResponseEventLogStats } from "$lib/slices/invokers/types";
import type { Population, Slice } from "$lib/slices/types";
import { sliceStats } from "$lib/statistics/invokers/slice-stats";

/**
 * The loaded project's slices, base first. Module-level `$state`, so an edit
 * in one view is visible in every other without prop-drilling.
 */
export const slices = $state<Slice[]>([]);
export const slicesLoaded = $state<{ projectId: string | null }>({ projectId: null });

/**
 * Slice accents in fixed order — blue, orange. The palette is why slices are
 * capped: a third would have to reuse a hue.
 */
const SLICE_COLORS = ["slice-1", "slice-2"];
/** Base is the reference population, so it reads as grey next to the accents. */
const BASE_COLOR = "slice-base";

/** Slices a project may have, beyond the base. */
export const MAX_SLICES = SLICE_COLORS.length;

/**
 * A slice's accent, derived from its kind and position rather than read back
 * from the stored `color`, which is still written but never read here.
 */
export function sliceColor(slice: Slice): string {
  return slice.kind === "base" ? BASE_COLOR : SLICE_COLORS[slice.position % SLICE_COLORS.length];
}

function byPosition(a: Slice, b: Slice): number {
  if (a.kind !== b.kind) return a.kind === "base" ? -1 : 1;
  return a.position - b.position;
}

export function baseSlice(): Slice | null {
  return slices.find((s) => s.kind === "base") ?? null;
}

export function namedSlices(): Slice[] {
  return slices.filter((s) => s.kind === "slice");
}

/**
 * The chain actually evaluated for a slice: the base chain runs first, then
 * the slice's own. Composed here so the ordering rule lives in one place.
 */
export function effectiveChain(slice: Slice): Filter[] {
  if (slice.kind === "base") return slice.filters;
  return [...(baseSlice()?.filters ?? []), ...slice.filters];
}

/** Identifies the numbers a chain produces, for the `stats` cache. */
export function chainKey(chain: Filter[]): string {
  return JSON.stringify(chain);
}

export async function loadSlices(projectId: string) {
  const rows = await db().select().from(slicesTable).where(eq(slicesTable.projectId, projectId));
  slices.splice(0, slices.length, ...rows.sort(byPosition));
  slicesLoaded.projectId = projectId;
}

async function insert(slice: Slice): Promise<Slice> {
  await db().insert(slicesTable).values(slice);
  slices.push(slice);
  slices.sort(byPosition);
  return slice;
}

/**
 * The base slice is created on first use rather than at project creation, so
 * projects that are never filtered carry no slice rows at all.
 */
export async function ensureBase(projectId: string): Promise<Slice> {
  const existing = baseSlice();
  if (existing) return existing;
  return insert({
    id: crypto.randomUUID(),
    projectId,
    kind: "base",
    name: "Base",
    color: BASE_COLOR,
    position: 0,
    filters: [],
    stats: null,
    statsKey: null
  });
}

export function canCreateSlice(): boolean {
  return namedSlices().length < MAX_SLICES;
}

/**
 * Creates a slice, or returns null when the project is already at the cap —
 * callers disable the control, so hitting this means the UI raced.
 */
export async function createSlice(projectId: string, name?: string): Promise<Slice | null> {
  if (!canCreateSlice()) return null;
  await ensureBase(projectId);
  const position = namedSlices().length;
  return insert({
    id: crypto.randomUUID(),
    projectId,
    kind: "slice",
    name: name?.trim() || `Slice ${position + 1}`,
    color: SLICE_COLORS[position % SLICE_COLORS.length],
    position,
    filters: [],
    stats: null,
    statsKey: null
  });
}

/**
 * Persists a change and reflects it in the loaded array. Edits are live —
 * there is no apply step, so every write is immediately what the views read.
 */
async function patch(id: string, changes: Partial<Slice>) {
  await db().update(slicesTable).set(changes).where(eq(slicesTable.id, id));
  const slice = slices.find((s) => s.id === id);
  if (slice) Object.assign(slice, changes);
}

/**
 * Changing a chain invalidates the cached stats of the slice — and of every
 * slice downstream of it, which for the base chain is all of them.
 */
export async function setFilters(slice: Slice, filters: Filter[]) {
  await patch(slice.id, { filters, stats: null, statsKey: null });
  if (slice.kind === "base") {
    await Promise.all(namedSlices().map((s) => patch(s.id, { stats: null, statsKey: null })));
  }
}

export async function renameSlice(slice: Slice, name: string) {
  const trimmed = name.trim();
  if (trimmed) await patch(slice.id, { name: trimmed });
}

export async function removeSlice(id: string) {
  await db().delete(slicesTable).where(eq(slicesTable.id, id));
  const index = slices.findIndex((s) => s.id === id);
  if (index !== -1) slices.splice(index, 1);

  // Positions and colours are assigned by index, so a gap would let the next
  // slice created claim a colour already on screen. Close it.
  await Promise.all(
    namedSlices().map((slice, position) =>
      slice.position === position
        ? Promise.resolve()
        : patch(slice.id, { position, color: SLICE_COLORS[position] })
    )
  );
}

/** Drops every slice of a project. Called when the project itself is deleted. */
export async function removeSlicesForProject(projectId: string) {
  await db().delete(slicesTable).where(eq(slicesTable.projectId, projectId));
  if (slicesLoaded.projectId === projectId) {
    slices.length = 0;
    slicesLoaded.projectId = null;
  }
}

/**
 * Measured chains, keyed by slice id, so the filter rows and the comparison
 * summary share one scan. The stored `key` is what detects a stale one.
 */
export const impacts = $state<Record<string, { key: string; steps: ResponseChainStep[] }>>({});

export async function loadImpact(project: Project, slice: Slice) {
  const key = chainKey(effectiveChain(slice));
  if (impacts[slice.id]?.key === key) return;
  const steps = await chainImpact(project, effectiveChain(slice));
  impacts[slice.id] = { key, steps };
}

/** A slice's measured chain, or null while it is stale or still in flight. */
export function sliceSteps(slice: Slice): ResponseChainStep[] | null {
  const measured = impacts[slice.id];
  return measured?.key === chainKey(effectiveChain(slice)) ? measured.steps : null;
}

/** Cases remaining after a slice's whole chain. */
export function sliceCases(slice: Slice): number | null {
  const steps = sliceSteps(slice);
  return steps ? (steps[steps.length - 1]?.cases ?? null) : null;
}

/** Events remaining after a slice's whole chain. */
export function sliceEvents(slice: Slice): number | null {
  const steps = sliceSteps(slice);
  return steps ? (steps[steps.length - 1]?.events ?? null) : null;
}

/**
 * Cases in both named slices' chains, keyed by the pair's combined chain key
 * so an edit to either invalidates it. In memory only.
 */
const sharedCasesCache = $state<Record<string, number>>({});

function sharedCasesKey(a: Slice, b: Slice): string {
  return chainKey([effectiveChain(a), effectiveChain(b)] as unknown as Filter[]);
}

export async function loadSharedCases(project: Project, a: Slice, b: Slice) {
  const key = sharedCasesKey(a, b);
  if (key in sharedCasesCache) return;
  const count = await fetchSharedCases(project, effectiveChain(a), effectiveChain(b));
  sharedCasesCache[key] = count;
}

/** Cases shared between two named slices, or null while unmeasured. */
export function sharedCases(a: Slice, b: Slice): number | null {
  const key = sharedCasesKey(a, b);
  return key in sharedCasesCache ? sharedCasesCache[key] : null;
}

export function populations(): Population[] {
  const base = baseSlice();
  const whole: Population = {
    id: "whole",
    name: "Whole log",
    color: "foreground",
    chain: [],
    stats: null
  };
  const fromSlice = (slice: Slice): Population => ({
    id: slice.id,
    name: slice.name,
    color: sliceColor(slice),
    chain: effectiveChain(slice),
    stats: slice.statsKey === chainKey(effectiveChain(slice)) ? slice.stats : null
  });
  return [whole, ...(base ? [fromSlice(base)] : []), ...namedSlices().map(fromSlice)];
}

/**
 * Computes whatever is missing and writes it back to the cache. Batched: the
 * whole log, the base and every slice share one read of the Parquet file.
 * Returns stats per population id, including the ones that were already cached.
 */
export async function computeStats(
  project: Project,
  wanted: Population[]
): Promise<Record<string, ResponseEventLogStats>> {
  const cached: Record<string, ResponseEventLogStats> = {};
  const missing = wanted.filter((p) => {
    if (p.stats) cached[p.id] = p.stats;
    return !p.stats;
  });
  if (missing.length === 0) return cached;

  const results = await sliceStats(
    project,
    missing.map((p) => p.chain)
  );

  await Promise.all(
    missing.map(async (population, index) => {
      const stats = results[index];
      cached[population.id] = stats;
      if (population.id !== "whole") {
        await patch(population.id, { stats, statsKey: chainKey(population.chain) });
      }
    })
  );
  return cached;
}

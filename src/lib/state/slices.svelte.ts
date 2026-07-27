import { eq } from "drizzle-orm";
import { invoke } from "@tauri-apps/api/core";
import { db } from "$lib/db/client";
import { slices as slicesTable } from "$lib/db/schema";
import type { Filter } from "$lib/filters";
import type { EventLogStats, Project, Slice } from "$lib/types";

/**
 * The loaded project's slices, base first. Module-level `$state` like
 * `projects` — the filter editor and every analysis view read the same array,
 * so an edit in one is visible in the others without prop-drilling.
 */
export const slices = $state<Slice[]>([]);
export const slicesLoaded = $state<{ projectId: string | null }>({ projectId: null });

/**
 * Slice accents in fixed order — blue, orange, green. Complementary hues, so
 * two populations charted side by side are never mistaken for each other. The
 * palette is why slices are capped: a fourth would have to reuse a hue.
 */
const SLICE_COLORS = ["slice-1", "slice-2", "slice-3"];
const BASE_COLOR = "foreground";

/** Slices a project may have, beyond the base. */
export const MAX_SLICES = SLICE_COLORS.length;

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
 * The chain actually evaluated for a slice: the base chain runs first, then the
 * slice's own. Composed here rather than in Rust so the ordering rule lives in
 * one place.
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

/** How much of the log survives one step of a chain. */
export interface ChainStep {
  cases: number;
  events: number;
}

/**
 * Sizes after each prefix of `chain`: index 0 is the unfiltered log, index
 * `i + 1` the result after filter `i`. Used to show what each filter costs.
 */
export function chainImpact(project: Project, chain: Filter[]): Promise<ChainStep[]> {
  return invoke<ChainStep[]>("chain_impact", {
    projectId: project.id,
    chain,
    columns: project.columns
  });
}

/**
 * One population in the Statistics view. The whole log is included as a
 * chainless population, so it is not a slice row and never needs storing.
 */
export interface Population {
  id: string;
  name: string;
  color: string;
  chain: Filter[];
  stats: EventLogStats | null;
}

export function populations(): Population[] {
  const base = baseSlice();
  const whole: Population = {
    id: "whole",
    name: "Whole log",
    color: "muted-foreground",
    chain: [],
    stats: null
  };
  const fromSlice = (slice: Slice): Population => ({
    id: slice.id,
    name: slice.name,
    color: slice.color,
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
): Promise<Record<string, EventLogStats>> {
  const cached: Record<string, EventLogStats> = {};
  const missing = wanted.filter((p) => {
    if (p.stats) cached[p.id] = p.stats;
    return !p.stats;
  });
  if (missing.length === 0) return cached;

  const results = await invoke<EventLogStats[]>("slice_stats", {
    projectId: project.id,
    chains: missing.map((p) => p.chain),
    columns: project.columns
  });

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

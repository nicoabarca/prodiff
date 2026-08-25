import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { groups as groupsTable } from "$lib/db/schema";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import { appliedGroups } from "$lib/groups/invokers/applied-groups";
import { applyGroup as applyGroupFile } from "$lib/groups/invokers/apply-group";
import { deleteGroupFile } from "$lib/groups/invokers/delete-group-file";
import { filtersImpact } from "$lib/groups/invokers/filters-impact";
import { fetchSharedCases } from "$lib/groups/invokers/shared-cases";
import { groupStats } from "$lib/groups/invokers/group-stats";
import type { ResponseEventLogStats, ResponseFilterStep } from "$lib/groups/invokers/types";
import { defaultColor, ORIGINAL_COLOR } from "$lib/groups/colors";
import { ORIGINAL_ID, ORIGINAL_NAME, type Group } from "$lib/groups/types";
import { groupId } from "$lib/groups/utils/group-id";

/**
 * The loaded project's Groups, in position order. Module-level `$state`, so an
 * edit in one view is visible in every other without prop-drilling.
 *
 * The Original is not in here: it has no row, and `allGroups` prepends it.
 */
export const groups = $state<Group[]>([]);
export const groupsLoaded = $state<{ projectId: string | null }>({ projectId: null });

function byPosition(a: Group, b: Group): number {
  return a.position - b.position;
}

/**
 * The whole Event Log as a Group. Synthesized rather than stored — it is the
 * one Group whose Filter List is empty, and it exists before any other does.
 */
export function originalGroup(projectId: string): Group {
  return {
    id: ORIGINAL_ID,
    projectId,
    name: ORIGINAL_NAME,
    color: ORIGINAL_COLOR,
    position: -1,
    filters: [],
    stats: null,
    createdAt: "",
    editedAt: ""
  };
}

/** Every Group a Comparison can draw on, the Original first. */
export function allGroups(projectId: string): Group[] {
  return [originalGroup(projectId), ...groups];
}

/** A Group has a Parquet exactly when Apply has filled its figures. */
export function isApplied(group: Group): boolean {
  return group.id === ORIGINAL_ID || group.stats !== null;
}

/**
 * Loads a project's Groups, dropping the cached figures of any whose Parquet
 * is missing. That state is reachable — a crash between deleting a file and
 * deleting its row leaves it — and it means unmaterialized, not corrupt.
 */
export async function loadGroups(projectId: string) {
  const rows = await db().select().from(groupsTable).where(eq(groupsTable.projectId, projectId));
  const ordered = rows.sort(byPosition);

  const applied = await appliedGroups(
    projectId,
    ordered.map((group) => group.id)
  );
  ordered.forEach((group, index) => {
    if (!applied[index]) group.stats = null;
  });

  groups.splice(0, groups.length, ...ordered);
  groupsLoaded.projectId = projectId;
}

export async function createGroup(projectId: string, name?: string): Promise<Group> {
  const position = groups.length;
  const now = new Date().toISOString();
  const group: Group = {
    id: groupId(),
    projectId,
    name: name?.trim() || `Group ${position + 1}`,
    color: defaultColor(position),
    position,
    filters: [],
    stats: null,
    createdAt: now,
    editedAt: now
  };
  await db().insert(groupsTable).values(group);
  groups.push(group);
  groups.sort(byPosition);
  return group;
}

/** Persists a change and reflects it in the loaded array. */
async function patch(id: string, changes: Partial<Group>) {
  await db()
    .update(groupsTable)
    .set({ ...changes, editedAt: new Date().toISOString() })
    .where(eq(groupsTable.id, id));
  const group = groups.find((g) => g.id === id);
  if (group) Object.assign(group, changes);
}

/**
 * Writes a Group's Parquet and stores the figures that pass returned. This is
 * the only path that changes what the other views read: editing a Filter List
 * is a draft until it comes through here.
 */
export async function applyGroup(project: Project, group: Group, filters: Filter[]) {
  const stats = await applyGroupFile(project, group.id, filters);
  await patch(group.id, { filters, stats });
}

export async function renameGroup(group: Group, name: string) {
  const trimmed = name.trim();
  if (trimmed) await patch(group.id, { name: trimmed });
}

export async function recolorGroup(group: Group, color: string) {
  await patch(group.id, { color });
}

/**
 * Deletes a Group, file before row, so a failure leaves both halves in place.
 * Positions are re-packed afterwards; colours are not, because the user owns
 * them once the Group exists.
 */
export async function removeGroup(id: string) {
  const group = groups.find((g) => g.id === id);
  if (!group) return;

  await deleteGroupFile(group.projectId, id);
  await db().delete(groupsTable).where(eq(groupsTable.id, id));
  groups.splice(groups.indexOf(group), 1);

  await Promise.all(
    groups.map((other, position) =>
      other.position === position ? Promise.resolve() : patch(other.id, { position })
    )
  );
}

/** Drops every Group of a project. Called when the project itself is deleted. */
export async function removeGroupsForProject(projectId: string) {
  await db().delete(groupsTable).where(eq(groupsTable.projectId, projectId));
  if (groupsLoaded.projectId === projectId) {
    groups.length = 0;
    groupsLoaded.projectId = null;
  }
}

/** Identifies the numbers a Filter List produces, for the caches below. */
export function filtersKey(filters: Filter[]): string {
  return JSON.stringify(filters);
}

/**
 * Measured Filter Lists, keyed by Group id, so the filter rows and the summary
 * share one scan. The stored `key` is what detects a stale one.
 */
export const impacts = $state<Record<string, { key: string; steps: ResponseFilterStep[] }>>({});

export async function loadImpact(project: Project, group: Group) {
  const key = filtersKey(group.filters);
  if (impacts[group.id]?.key === key) return;
  const steps = await filtersImpact(project, group.filters);
  impacts[group.id] = { key, steps };
}

/** A Group's measured Filter List, or null while it is stale or in flight. */
export function groupSteps(group: Group): ResponseFilterStep[] | null {
  const measured = impacts[group.id];
  return measured?.key === filtersKey(group.filters) ? measured.steps : null;
}

/** Cases remaining after a Group's whole Filter List. */
export function groupCases(group: Group): number | null {
  const steps = groupSteps(group);
  return steps ? (steps[steps.length - 1]?.cases ?? null) : null;
}

/** Events remaining after a Group's whole Filter List. */
export function groupEvents(group: Group): number | null {
  const steps = groupSteps(group);
  return steps ? (steps[steps.length - 1]?.events ?? null) : null;
}

/**
 * Cases in both Groups' Filter Lists, keyed by the pair so an edit to either
 * invalidates it. In memory only.
 */
const sharedCasesCache = $state<Record<string, number>>({});

function sharedCasesKey(a: Group, b: Group): string {
  return `${filtersKey(a.filters)}|${filtersKey(b.filters)}`;
}

export async function loadSharedCases(project: Project, a: Group, b: Group) {
  const key = sharedCasesKey(a, b);
  if (key in sharedCasesCache) return;
  sharedCasesCache[key] = await fetchSharedCases(project, a.filters, b.filters);
}

/** Cases shared between two Groups, or null while unmeasured. */
export function sharedCases(a: Group, b: Group): number | null {
  const key = sharedCasesKey(a, b);
  return key in sharedCasesCache ? sharedCasesCache[key] : null;
}

/**
 * Computes whatever is missing and writes it back to the cache. Batched: every
 * Group asked for shares one round trip. Returns figures per Group id,
 * including the ones that were already cached.
 *
 * An unapplied Group has no Parquet to read, so it is skipped rather than
 * asked for — in practice the Original is the only Group that ever lands here,
 * since Apply fills the figures of every other one as it writes the file.
 */
export async function computeStats(
  project: Project,
  wanted: Group[]
): Promise<Record<string, ResponseEventLogStats>> {
  const cached: Record<string, ResponseEventLogStats> = {};
  const missing = wanted.filter((group) => {
    if (group.stats) cached[group.id] = group.stats;
    return !group.stats && isApplied(group);
  });
  if (missing.length === 0) return cached;

  const results = await groupStats(
    project,
    missing.map((group) => group.id)
  );

  await Promise.all(
    missing.map(async (group, index) => {
      const stats = results[index];
      cached[group.id] = stats;
      if (group.id !== ORIGINAL_ID) await patch(group.id, { stats });
    })
  );
  return cached;
}

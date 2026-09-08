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

/** The loaded project's Groups, in position order. The Original is not one of them. */
export const groups = $state<Group[]>([]);
export const groupsLoaded = $state<{ projectId: string | null }>({ projectId: null });

function byPosition(a: Group, b: Group): number {
  return a.position - b.position;
}

/** The whole Event Log as a Group. Synthesized, never stored. */
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

/** Loads a project's Groups, dropping the cached figures of any whose Parquet is gone. */
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

/**
 * A Group carves cases out of the Event Log, so one with no filters is the
 * Original under another name. The first filter is what brings it into being.
 */
export async function createGroup(
  projectId: string,
  filters: Filter[],
  name?: string
): Promise<Group> {
  if (filters.length === 0) throw new Error("A group needs at least one filter.");
  const position = groups.length;
  const now = new Date().toISOString();
  const group: Group = {
    id: groupId(),
    projectId,
    name: name?.trim() || `Group ${position + 1}`,
    color: defaultColor(position),
    position,
    filters,
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

/** Writes a Group's Parquet and stores the figures that pass returned. */
export async function applyGroup(project: Project, group: Group, filters: Filter[]) {
  if (filters.length === 0) throw new Error("A group needs at least one filter.");
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

/** Groups whose Filter List excludes this one, and so cannot outlive it. */
export function dependentsOf(group: Group): Group[] {
  return groups.filter((other) =>
    other.filters.some(
      (filter) => filter.kind === "case_not_in_group" && filter.groupId === group.id
    )
  );
}

/** Deletes a Group and everything that excludes it, then re-packs the positions. */
export async function removeGroup(id: string) {
  const group = groups.find((g) => g.id === id);
  if (!group) return;

  for (const doomed of [...dependentsOf(group), group]) {
    await deleteGroupFile(doomed.projectId, doomed.id);
    await db().delete(groupsTable).where(eq(groupsTable.id, doomed.id));
    const index = groups.indexOf(doomed);
    if (index !== -1) groups.splice(index, 1);
  }

  await Promise.all(
    groups.map((other, position) =>
      other.position === position ? Promise.resolve() : patch(other.id, { position })
    )
  );
}

/** Drops every Group of a project. */
export async function removeGroupsForProject(projectId: string) {
  await db().delete(groupsTable).where(eq(groupsTable.projectId, projectId));
  if (groupsLoaded.projectId === projectId) {
    groups.length = 0;
    groupsLoaded.projectId = null;
  }
}

/** Cache key for a Filter List. */
export function filtersKey(filters: Filter[]): string {
  return JSON.stringify(filters);
}

/**
 * Measured Filter Lists, keyed by Group id. The stored `key` detects a stale
 * one. The draft preview: it measures whatever list the editor is holding.
 */
export const impacts = $state<Record<string, { key: string; steps: ResponseFilterStep[] }>>({});

export async function loadImpact(project: Project, group: Group, filters = group.filters) {
  const key = filtersKey(filters);
  if (impacts[group.id]?.key === key) return;
  const steps = await filtersImpact(project, filters);
  impacts[group.id] = { key, steps };
}

/** A measured Filter List, or null while it is stale or still in flight. */
export function groupSteps(group: Group, filters = group.filters): ResponseFilterStep[] | null {
  const measured = impacts[group.id];
  return measured?.key === filtersKey(filters) ? measured.steps : null;
}

/** Cases remaining after a Group's whole Filter List. */
export function groupCases(group: Group, filters = group.filters): number | null {
  const steps = groupSteps(group, filters);
  return steps ? (steps[steps.length - 1]?.cases ?? null) : null;
}

/** Events remaining after a Group's whole Filter List. */
export function groupEvents(group: Group, filters = group.filters): number | null {
  const steps = groupSteps(group, filters);
  return steps ? (steps[steps.length - 1]?.events ?? null) : null;
}

/** Cases in every Group at once, keyed by the set and by what each one holds. */
const sharedCasesCache = $state<Record<string, number>>({});

function sharedCasesKey(entries: Group[]): string {
  return entries.map((group) => `${group.id}:${filtersKey(group.filters)}`).join("|");
}

/** Unapplied Groups have no Parquet to intersect, so there is nothing to ask. */
export async function loadSharedCases(project: Project, entries: Group[]) {
  if (entries.length < 2 || !entries.every(isApplied)) return;
  const key = sharedCasesKey(entries);
  if (key in sharedCasesCache) return;
  sharedCasesCache[key] = await fetchSharedCases(
    project,
    entries.map((group) => group.id)
  );
}

/** Cases shared by every Group, or null while unmeasured. */
export function sharedCases(entries: Group[]): number | null {
  const key = sharedCasesKey(entries);
  return key in sharedCasesCache ? sharedCasesCache[key] : null;
}

/** Statistics per Group id, in one round trip. Unapplied Groups are skipped. */
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

import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { comparisons as comparisonsTable } from "$lib/db/schema";
import type { Project } from "$lib/event-log/types";
import { comparisonRelation } from "$lib/groups/invokers/comparison-relation";
import type { ResponseRelation } from "$lib/groups/invokers/types";
import { groups, isApplied, originalGroup, revisionOf } from "$lib/groups/state/groups.svelte";
import { loadSavedComparisons, savedComparisons } from "$lib/groups/state/saved-comparisons.svelte";
import { afterApplyCopy } from "$lib/groups/utils/comparison-note";
import { toast } from "svelte-sonner";
import { ORIGINAL_ID, type Group } from "$lib/groups/types";

/**
 * Which Groups the comparison views draw, as the Compare popover picked them and
 * as the `comparisons` table remembers them. One or two Group ids, in the order
 * they are drawn.
 */
export const comparison = $state<{ projectId: string | null; groupIds: string[] }>({
  projectId: null,
  groupIds: []
});

/** Loads what a project compares, and the Saved Comparisons it can switch to. */
export async function loadComparison(projectId: string) {
  const [rows] = await Promise.all([
    db().select().from(comparisonsTable).where(eq(comparisonsTable.projectId, projectId)),
    loadSavedComparisons(projectId)
  ]);
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
 * The Groups being compared: what the popover picked, resolved to the Groups
 * themselves. Only applied Groups can be read, and anything the selection names
 * that has since been deleted or un-applied falls away, so a stale selection
 * degrades to the Original. Capped at two.
 */
export function comparedGroups(): Group[] {
  const projectId = groups[0]?.projectId ?? comparison.projectId ?? "";
  const original = originalGroup(projectId);
  const known = (id: string): Group | null =>
    id === ORIGINAL_ID
      ? original
      : (groups.find((group) => group.id === id && isApplied(group)) ?? null);

  const picked = comparison.groupIds.map(known).filter((group): group is Group => group !== null);
  return picked.length === 0 ? [original] : picked.slice(0, 2);
}

/** The ids the seam takes: one for a single-Group view, two for a comparison. */
export function comparedIds(): string[] {
  return comparedGroups().map((group) => group.id);
}

/**
 * What is compared, down to each Group's Parquet. A Group's revision moves on
 * every Apply, so a rename never changes it; the Original's cases never change.
 */
export function comparisonKey(): string {
  return JSON.stringify(
    comparedGroups().map((group) =>
      group.id === ORIGINAL_ID ? [group.id] : [group.id, revisionOf(group.id)]
    )
  );
}

/** How the two compared Groups relate, for the key it was loaded under. */
export const relation = $state<{
  key: string | null;
  state: "loading" | "ready" | "failed";
  summary: ResponseRelation | null;
  error: string | null;
}>({ key: null, state: "loading", summary: null, error: null });

/** Loads the relation when what is compared has changed. The last request wins. */
export async function loadRelation(project: Project) {
  const key = comparisonKey();
  if (relation.key === key) return;
  const ids = comparedIds();
  relation.key = key;
  relation.error = null;
  if (ids.length < 2) {
    relation.state = "ready";
    relation.summary = null;
    return;
  }
  relation.state = "loading";
  relation.summary = null;
  try {
    const summary = await comparisonRelation(project, ids);
    if (comparisonKey() !== key) return;
    relation.summary = summary;
    relation.state = "ready";
  } catch (cause) {
    if (comparisonKey() !== key) return;
    relation.error = String(cause);
    relation.state = "failed";
  }
}

/** Whether the comparison views may build: one Group, or two that can be compared. */
export function relationReady(): boolean {
  if (comparedIds().length < 2) return true;
  if (relation.key !== comparisonKey() || relation.state !== "ready") return false;
  return relation.summary === null || relation.summary.status === "ok";
}

/** Whether the compared pair cannot be shown: refused by the rule, or its read failed. */
export function relationRefused(): boolean {
  if (relation.key !== comparisonKey()) return false;
  if (relation.state === "failed") return true;
  return (
    relation.state === "ready" && relation.summary !== null && relation.summary.status !== "ok"
  );
}

/**
 * After an Apply, warns about each two-Group Comparison naming this Group that
 * can no longer be compared: the one in use and every Saved Comparison.
 */
export async function checkAfterApply(project: Project, group: Group) {
  const resolve = (id: string): Group | null =>
    id === ORIGINAL_ID
      ? originalGroup(project.id)
      : (groups.find((g) => g.id === id && isApplied(g)) ?? null);
  const pairs = [
    comparison.projectId === project.id ? comparison.groupIds : [],
    ...savedComparisons.filter((saved) => saved.projectId === project.id).map((s) => s.groupIds)
  ].filter((ids) => ids.length === 2 && ids.includes(group.id));
  const seen = new Set<string>();
  for (const ids of pairs) {
    const key = ids.join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const named = ids.map(resolve);
    if (named.some((g) => g === null)) continue;
    const summary = await comparisonRelation(project, ids);
    if (summary.status !== "ok") toast.warning(afterApplyCopy(named as Group[], summary));
  }
}

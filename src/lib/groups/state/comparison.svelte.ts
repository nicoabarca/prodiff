import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { comparisons as comparisonsTable } from "$lib/db/schema";
import { groups, isApplied, originalGroup } from "$lib/groups/state/groups.svelte";
import { ORIGINAL_ID, type Group } from "$lib/groups/types";

/**
 * Which Groups the comparison views draw, as the compare modal picked them and
 * as the `comparisons` table remembers them. One or two Group ids, in the order
 * they are drawn.
 */
export const comparison = $state<{ projectId: string | null; groupIds: string[] }>({
  projectId: null,
  groupIds: []
});

export async function loadComparison(projectId: string) {
  const rows = await db()
    .select()
    .from(comparisonsTable)
    .where(eq(comparisonsTable.projectId, projectId));
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
 * The Groups being compared: what the modal picked, resolved to the Groups
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

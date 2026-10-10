import { eq, inArray } from "drizzle-orm";
import { db } from "$lib/db/client";
import { savedComparisons as savedComparisonsTable } from "$lib/db/schema";
import type { SavedComparison } from "$lib/groups/types";
import { groupId } from "$lib/groups/utils/group-id";

/** The loaded project's Saved Comparisons, oldest first, as the table holds them. */
export const savedComparisons = $state<SavedComparison[]>([]);

function keep(wanted: (saved: SavedComparison) => boolean) {
  savedComparisons.splice(0, savedComparisons.length, ...savedComparisons.filter(wanted));
}

export async function loadSavedComparisons(projectId: string) {
  const rows = await db()
    .select()
    .from(savedComparisonsTable)
    .where(eq(savedComparisonsTable.projectId, projectId))
    .orderBy(savedComparisonsTable.createdAt);
  savedComparisons.splice(0, savedComparisons.length, ...rows);
}

export async function createSavedComparison(
  projectId: string,
  groupIds: string[]
): Promise<SavedComparison> {
  const saved: SavedComparison = { id: groupId(), projectId, groupIds, createdAt: Date.now() };
  await db().insert(savedComparisonsTable).values(saved);
  savedComparisons.push(saved);
  return saved;
}

export async function updateSavedComparison(id: string, groupIds: string[]) {
  await db()
    .update(savedComparisonsTable)
    .set({ groupIds })
    .where(eq(savedComparisonsTable.id, id));
  const saved = savedComparisons.find((entry) => entry.id === id);
  if (saved) saved.groupIds = groupIds;
}

export async function deleteSavedComparison(id: string) {
  await db().delete(savedComparisonsTable).where(eq(savedComparisonsTable.id, id));
  keep((saved) => saved.id !== id);
}

/** Deletes every Saved Comparison of a project that names one of these Groups. */
export async function deleteSavedComparisonsNaming(projectId: string, groupIds: string[]) {
  const rows = await db()
    .select()
    .from(savedComparisonsTable)
    .where(eq(savedComparisonsTable.projectId, projectId));
  const doomed = rows
    .filter((row) => row.groupIds.some((id) => groupIds.includes(id)))
    .map((row) => row.id);
  if (doomed.length === 0) return;
  await db().delete(savedComparisonsTable).where(inArray(savedComparisonsTable.id, doomed));
  keep((saved) => !doomed.includes(saved.id));
}

export async function deleteSavedComparisonsForProject(projectId: string) {
  await db().delete(savedComparisonsTable).where(eq(savedComparisonsTable.projectId, projectId));
  keep((saved) => saved.projectId !== projectId);
}

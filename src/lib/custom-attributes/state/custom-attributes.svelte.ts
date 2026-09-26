import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { customAttributes as customAttributesTable } from "$lib/db/schema";
import { updateCustomAttributes } from "$lib/custom-attributes/invokers/update-custom-attributes";
import type { CustomAttributeDraft } from "$lib/custom-attributes/state/drafts.svelte";
import { whileApplying } from "$lib/custom-attributes/state/applying.svelte";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import { customAttributeId } from "$lib/custom-attributes/utils/custom-attribute-id";
import { parseFormula } from "$lib/custom-attributes/utils/parser";
import type { Project } from "$lib/event-log/types";

/** The loaded project's Custom Attributes, in position order. */
export const customAttributes = $state<CustomAttribute[]>([]);
export const customAttributesLoaded = $state<{ projectId: string | null }>({ projectId: null });

function byPosition(a: CustomAttribute, b: CustomAttribute): number {
  return a.position - b.position;
}

/** A Custom Attribute has its column exactly when Apply has stored its empty count. */
export function isApplied(attribute: CustomAttribute): boolean {
  return attribute.emptyCount !== null;
}

export async function loadCustomAttributes(projectId: string) {
  const rows = await db()
    .select()
    .from(customAttributesTable)
    .where(eq(customAttributesTable.projectId, projectId));
  customAttributes.splice(0, customAttributes.length, ...rows.sort(byPosition));
  customAttributesLoaded.projectId = projectId;
}

/** Saves a new Custom Attribute. Its column is written by Apply, not here. */
export async function createCustomAttribute(
  projectId: string,
  draft: CustomAttributeDraft
): Promise<CustomAttribute> {
  const now = new Date().toISOString();
  const attribute: CustomAttribute = {
    id: customAttributeId(),
    projectId,
    name: draft.name.trim(),
    formula: draft.formula,
    position: customAttributes.length,
    emptyCount: null,
    createdAt: now,
    editedAt: now
  };
  await db().insert(customAttributesTable).values(attribute);
  customAttributes.push(attribute);
  return attribute;
}

/** Persists a change and reflects it in the loaded array. */
async function patch(id: string, changes: Partial<CustomAttribute>) {
  await db()
    .update(customAttributesTable)
    .set({ ...changes, editedAt: new Date().toISOString() })
    .where(eq(customAttributesTable.id, id));
  const attribute = customAttributes.find((a) => a.id === id);
  if (attribute) Object.assign(attribute, changes);
}

/**
 * Writes an attribute's column into the Event Log and every applied Group, then
 * stores its empty count. The row changes first with a null count, so a failed
 * write reads as "not applied" rather than as the old figures under a new
 * formula. A change of name alone writes no file.
 */
export async function applyCustomAttribute(
  project: Project,
  attribute: CustomAttribute,
  draft: CustomAttributeDraft,
  appliedGroupIds: string[]
) {
  const name = draft.name.trim();
  if (isApplied(attribute) && draft.formula === attribute.formula) {
    await patch(attribute.id, { name });
    return;
  }
  const parsed = parseFormula(draft.formula);
  if (!parsed.ok) throw new Error(parsed.error);

  await patch(attribute.id, { name, formula: draft.formula, emptyCount: null });
  const groups = appliedGroupIds.length;
  const message = `Calculating ${name} for the event log${
    groups === 0 ? "" : ` and ${groups} ${groups === 1 ? "group" : "groups"}`
  }…`;
  const [count] = await whileApplying(message, () =>
    updateCustomAttributes(
      project,
      [{ id: attribute.id, formula: parsed.formula }],
      [],
      appliedGroupIds
    )
  );
  await patch(attribute.id, { emptyCount: count.empty });
}

/** Drops an attribute's column from every file, then its row, then re-packs the positions. */
export async function removeCustomAttribute(
  project: Project,
  attribute: CustomAttribute,
  appliedGroupIds: string[]
) {
  await whileApplying(`Removing ${attribute.name}…`, () =>
    updateCustomAttributes(project, [], [attribute.id], appliedGroupIds)
  );
  await db().delete(customAttributesTable).where(eq(customAttributesTable.id, attribute.id));
  const index = customAttributes.findIndex((a) => a.id === attribute.id);
  if (index !== -1) customAttributes.splice(index, 1);
  await Promise.all(
    customAttributes.map((other, position) =>
      other.position === position ? Promise.resolve() : patch(other.id, { position })
    )
  );
}

/** Drops every Custom Attribute of a project. Its files go with the project's directory. */
export async function removeCustomAttributesForProject(projectId: string) {
  await db().delete(customAttributesTable).where(eq(customAttributesTable.projectId, projectId));
  if (customAttributesLoaded.projectId === projectId) {
    customAttributes.length = 0;
    customAttributesLoaded.projectId = null;
  }
}

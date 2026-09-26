import type { CustomAttribute } from "$lib/custom-attributes/types";

/** What the editor changes on a Custom Attribute. */
export interface CustomAttributeDraft {
  name: string;
  formula: string;
}

/**
 * Unapplied edits to Custom Attributes, by id. In memory only, so a draft is
 * lost on reload.
 */
const drafts = $state<Record<string, CustomAttributeDraft>>({});

/** The version being edited: the draft when there is one, the applied one otherwise. */
export function draftOf(attribute: CustomAttribute): CustomAttributeDraft {
  return drafts[attribute.id] ?? { name: attribute.name, formula: attribute.formula };
}

/** Whether an attribute has edits that Apply has not written yet. */
export function isDirty(attribute: CustomAttribute): boolean {
  const draft = drafts[attribute.id];
  return (
    draft !== undefined && (draft.name !== attribute.name || draft.formula !== attribute.formula)
  );
}

export function setDraft(attribute: CustomAttribute, draft: CustomAttributeDraft) {
  drafts[attribute.id] = draft;
}

/** Drops the draft, so the attribute reads as its applied version again. */
export function discardDraft(attribute: CustomAttribute) {
  delete drafts[attribute.id];
}

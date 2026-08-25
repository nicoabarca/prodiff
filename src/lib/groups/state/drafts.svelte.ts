import type { Filter } from "$lib/filters/kind/filter";
import { filtersKey } from "$lib/groups/state/groups.svelte";
import type { Group } from "$lib/groups/types";

/**
 * Unapplied edits to a Group's Filter List, by Group id.
 *
 * Drafts live here rather than in the `groups` table on purpose: a Group that
 * carried both an applied list and a pending one would force every view to ask
 * which of the two its case count belongs to. A draft is seconds of work, so
 * losing it on reload is cheaper than that ambiguity.
 */
const drafts = $state<Record<string, Filter[]>>({});

/** The list being edited: the draft when there is one, the applied list otherwise. */
export function draftOf(group: Group): Filter[] {
  return drafts[group.id] ?? group.filters;
}

/** Whether a Group has edits that Apply has not written yet. */
export function isDirty(group: Group): boolean {
  const draft = drafts[group.id];
  return draft !== undefined && filtersKey(draft) !== filtersKey(group.filters);
}

/**
 * Replaces a Group's draft. Every edit — add, replace, remove, reorder, clear —
 * comes through here, because a draft is a plain array and each of those is one
 * array operation on it.
 */
export function setDraft(group: Group, filters: Filter[]) {
  drafts[group.id] = filters;
}

export function addToDraft(group: Group, filter: Filter) {
  setDraft(group, [...draftOf(group), filter]);
}

export function replaceInDraft(group: Group, index: number, filter: Filter) {
  setDraft(
    group,
    draftOf(group).map((existing, i) => (i === index ? filter : existing))
  );
}

export function removeFromDraft(group: Group, index: number) {
  setDraft(
    group,
    draftOf(group).filter((_, i) => i !== index)
  );
}

/**
 * Moves a filter. Reordering is not cosmetic: `keep_selected` and `trim` cut
 * events out of traces, so a later filter sees a different trace depending on
 * what ran before it.
 */
export function moveInDraft(group: Group, from: number, to: number) {
  const next = [...draftOf(group)];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setDraft(group, next);
}

/** Drops the draft, so the Group reads as its applied list again. */
export function discardDraft(group: Group) {
  delete drafts[group.id];
}

/**
 * Copies one Group's list onto another as a draft, which is what replaces the
 * old shared Base chain: two similar Groups are made by copying and editing
 * rather than by inheriting.
 */
export function copyDraftFrom(source: Group, target: Group) {
  setDraft(target, [...source.filters]);
}

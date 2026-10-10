import {
  NO_GROUP,
  ORIGINAL_ID,
  type ComparisonAction,
  type ComparisonDraft,
  type ComparisonSelection,
  type SavedComparison,
  type SaveTarget
} from "$lib/groups/types";

/** Order is part of a Comparison: the same two Groups swapped are another one. */
export function sameGroupIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** The editor's two sides for these Group ids. No ids is the Original alone. */
export function toDraft(groupIds: string[]): ComparisonDraft {
  return [groupIds[0] ?? ORIGINAL_ID, groupIds[1] ?? NO_GROUP];
}

/** The Group ids a draft compares: one when its second side is `NO_GROUP`. */
export function draftGroupIds([first, second]: ComparisonDraft): string[] {
  return second === NO_GROUP ? [first] : [first, second];
}

/**
 * The Saved Comparison holding exactly these Group ids, or null. Asked with the
 * ids being compared, it answers which one is in use.
 */
export function savedMatching(
  saved: SavedComparison[],
  groupIds: string[]
): SavedComparison | null {
  return saved.find((entry) => sameGroupIds(entry.groupIds, groupIds)) ?? null;
}

/** What the editor holds when the popover opens: the one in use, else a new draft. */
export function initialSelection(
  saved: SavedComparison[],
  compared: string[]
): ComparisonSelection {
  const inUse = savedMatching(saved, compared);
  return inUse ? { kind: "saved", id: inUse.id } : { kind: "new" };
}

/** What the editor holds once a Saved Comparison is gone, given the ones left. */
export function selectionAfterDelete(remaining: SavedComparison[]): ComparisonSelection {
  return remaining.length > 0 ? { kind: "saved", id: remaining[0].id } : { kind: "new" };
}

/**
 * What the primary button does. `selected` is the Saved Comparison in the
 * editor, null for a new draft; `compared` is what the views draw now.
 */
export function comparisonAction(
  selected: SavedComparison | null,
  draft: ComparisonDraft,
  compared: string[]
): ComparisonAction {
  if (!selected || !sameGroupIds(selected.groupIds, draftGroupIds(draft))) {
    return "save-and-compare";
  }
  return sameGroupIds(selected.groupIds, compared) ? "comparing" : "compare";
}

/**
 * Which row a saved draft lands in. A draft equal to a Saved Comparison is that
 * one, so no two rows hold the same Group ids.
 */
export function saveTarget(
  selected: SavedComparison | null,
  draft: ComparisonDraft,
  saved: SavedComparison[]
): SaveTarget {
  const existing = savedMatching(saved, draftGroupIds(draft));
  if (existing) return { kind: "existing", id: existing.id };
  return selected ? { kind: "update", id: selected.id } : { kind: "create" };
}

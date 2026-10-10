import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/** A named set of cases: a Filter List applied to the Event Log. Null `stats` means not applied yet. */
export interface Group {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  filters: Filter[];
  stats: ResponseEventLogStats | null;
  createdAt: string;
  editedAt: string;
}

/**
 * A Comparison kept to switch back to. `groupIds` is ordered and holds one or
 * two entries; `createdAt` is epoch milliseconds.
 */
export interface SavedComparison {
  id: string;
  projectId: string;
  groupIds: string[];
  createdAt: number;
}

/** What the Compare popover's editor holds: a Saved Comparison, or one not saved yet. */
export type ComparisonSelection = { kind: "saved"; id: string } | { kind: "new" };

/** The two sides of the editor. The second is `NO_GROUP` when one Group is shown alone. */
export type ComparisonDraft = [first: string, second: string];

/** What the editor's primary button does with its draft. */
export type ComparisonAction = "comparing" | "save-and-compare" | "compare";

/** Where a saved draft lands: a new row, the selected one, or one that already holds its ids. */
export type SaveTarget =
  { kind: "create" } | { kind: "update"; id: string } | { kind: "existing"; id: string };

/** The second side of a `ComparisonDraft` that compares against nothing. */
export const NO_GROUP = "__none";

/** The id the Original answers to. It has no row. */
export const ORIGINAL_ID = "original";

/** What the user sees for the Original. */
export const ORIGINAL_NAME = "Event Log";

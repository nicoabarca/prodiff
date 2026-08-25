import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/** A named set of cases: a Filter List applied to the Event Log. Null `stats` means not applied yet. */
export interface Group {
  id: string;
  projectId: string;
  name: string;
  /** A palette token name, never a colour literal. */
  color: string;
  position: number;
  /** The applied Filter List, never a draft. */
  filters: Filter[];
  stats: ResponseEventLogStats | null;
  createdAt: string;
  editedAt: string;
}

/** The id the Original answers to. It has no row. */
export const ORIGINAL_ID = "original";

/** What the user sees for the Original. */
export const ORIGINAL_NAME = "Event Log";

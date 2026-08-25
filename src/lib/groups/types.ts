import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";

/**
 * A named set of cases: a Filter List applied to the Event Log and written to
 * `groups/{id}.parquet`. `stats` is filled by Apply in the same pass that
 * writes that file, so a null one means the Group has no Parquet yet.
 */
export interface Group {
  id: string;
  projectId: string;
  name: string;
  /** A palette token name, chosen by the user. Never a colour literal. */
  color: string;
  position: number;
  /** The applied Filter List. A draft lives in the editor, never here. */
  filters: Filter[];
  stats: ResponseEventLogStats | null;
  createdAt: string;
  editedAt: string;
}

/**
 * The Original answers to this id everywhere — in the payloads, and in the
 * commands that resolve an id to a Parquet file. It has no row of its own.
 */
export const ORIGINAL_ID = "original";

/** What the user sees instead of "Original", which is the internal name. */
export const ORIGINAL_NAME = "Event Log";

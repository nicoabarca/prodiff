import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/slices/invokers/types";

/**
 * A named filter chain over a Project's Event Log. `base` (at most one per
 * project) applies to everything downstream; every `slice` chains on top of it.
 * A `statsKey` not matching the slice's effective chain means stale numbers.
 */
export type SliceKind = "base" | "slice";

export interface Slice {
  id: string;
  projectId: string;
  kind: SliceKind;
  name: string;
  /** A `--chart-*` CSS custom property name, assigned by position. */
  color: string;
  position: number;
  filters: Filter[];
  stats: ResponseEventLogStats | null;
  statsKey: string | null;
}

/**
 * One population in the Statistics view. The whole log is included as a
 * chainless population, so it is not a slice row and never needs storing.
 */
export interface Population {
  id: string;
  name: string;
  color: string;
  chain: Filter[];
  stats: ResponseEventLogStats | null;
}

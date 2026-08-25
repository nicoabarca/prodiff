/**
 * The value counts behind one node's charts, as Rust ships them. Every type here
 * mirrors a serde struct in `src-tauri/src/tree/distributions.rs`.
 */

export interface CategoryCount {
  value: string;
  /** Events holding this value, by Group id. */
  counts: Record<string, number>;
}

/** A Group's five-number summary with Tukey whiskers. Mirrors `BoxStats`. */
export interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** Extreme observations still inside 1.5·IQR, not the fences themselves. */
  whiskerLow: number;
  whiskerHigh: number;
  /** Points past the whiskers, as a count. */
  outliersLow: number;
  outliersHigh: number;
}

/**
 * The three encodings a duration is read in. Only Activity Duration and
 * Transition Time carry one; none of it survives the equal-width bins.
 */
export interface DurationShape {
    /**
     * Value at percentile `i`, `i` in `0..=100`, by Group id. The percentile is
     * the index. A Group with no values is absent.
     */
  ecdf: Record<string, number[]>;
  boxStats: Record<string, BoxStats>;
  /** `logEdges.length === logCounts[id].length + 1`; shared by every Group. */
  logEdges: number[];
  logCounts: Record<string, number[]>;
}

export type Distribution =
  | {
      type: "categorical";
      /** Biggest first by pooled count, capped at 200 by the backend. */
      values: CategoryCount[];
      /** Distinct values counted, before any cut. */
      distinct: number;
      /** Every value counted per Group, cut ones included. What makes `Other` exact. */
      totals: Record<string, number>;
    }
  | {
      type: "numerical";
      /** `edges.length === counts[id].length + 1`; shared by every Group. */
      edges: number[];
      counts: Record<string, number[]>;
      n: Record<string, number>;
      /** Set for durations only; `null` leaves the card with bars alone. */
      shape: DurationShape | null;
    }
  | { type: "empty" };

/**
 * One Group's totals at this node. `events` says how much wider `wholeCase` is
 * than `atStep`, which is the difference the Scope badge is about.
 */
export interface GroupTotals {
  id: string;
  cases: number;
  events: number;
}

export interface ResponseNodeDistributions {
    /**
     * The Groups on this card, in the order they were asked for. Carries both
     * order and identity; everything else is keyed by id.
     */
  groups: GroupTotals[];
  /** In the order the attributes were requested, so the cards keep theirs. */
  attributes: [string, Distribution][];
}

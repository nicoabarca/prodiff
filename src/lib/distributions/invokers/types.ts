/**
* The value counts behind one node's charts, as Rust ships them. Every type here
* mirrors a serde struct in `src-tauri/src/tree/distributions.rs`.
 */

export interface CategoryCount {
  value: string;
  a: number;
  b: number;
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
  /** Value at percentile `i`, `i` in `0..=100`; the percentile is the index. */
  ecdfA: number[];
  ecdfB: number[];
  boxA: BoxStats | null;
  boxB: BoxStats | null;
  /** `logEdges.length === logCountsA.length + 1`; shared by both Groups. */
  logEdges: number[];
  logCountsA: number[];
  logCountsB: number[];
}

export type Distribution =
  | {
      type: "categorical";
      /** Biggest first by pooled count, capped at 200 by the backend. */
      values: CategoryCount[];
      /** Distinct values counted, before any cut. */
      distinct: number;
      /** Every value counted, cut ones included. What makes `Other` exact. */
      totalA: number;
      totalB: number;
    }
  | {
      type: "numerical";
      /** `edges.length === countsA.length + 1`; shared by both Groups. */
      edges: number[];
      countsA: number[];
      countsB: number[];
      nA: number;
      nB: number;
      /** Set for durations only; `null` leaves the card with bars alone. */
      shape: DurationShape | null;
    }
  | { type: "empty" };

export interface ResponseNodeDistributions {
  /** In the order the attributes were requested, so the cards keep theirs. */
  attributes: [string, Distribution][];
  casesA: number;
  casesB: number;
  eventsA: number;
  eventsB: number;
}

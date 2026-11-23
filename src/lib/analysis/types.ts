/**
 * The figures every comparison view ships, whatever shape it hangs them off.
 * Mirrors the serde structs in `src-tauri/src/analysis/`.
 */

export interface AttributeBlock {
  summaries: Record<string, Summary>;
  test: Test | null;
}

export type Summary =
  | {
      type: "numerical";
      n: number;
      mean: number;
      std: number;
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      /** Tukey whiskers: the extreme observations within 1.5·IQR of the box. */
      whiskerLow: number;
      whiskerHigh: number;
      /** Observations past the whiskers, as a count. */
      outliersLow: number;
      outliersHigh: number;
    }
  | { type: "categorical"; n: number; counts: Record<string, number> };

export interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliersLow: number;
  outliersHigh: number;
  n?: number;
}

/** The values past a box plot's whiskers, ascending on each side. */
export interface Outliers {
  low: number[];
  high: number[];
}

/** Fetches one box plot's outliers, keyed by Group id. */
export type OutlierLoad = () => Promise<Record<string, Outliers>>;

/**
 * One Group's box under the adjusted box plot rule: whiskers moved by the
 * medcouple, a skew measure from -1 to 1, and the values past them.
 */
export interface AdjustedBox {
  medcouple: number;
  whiskerLow: number;
  whiskerHigh: number;
  low: number[];
  high: number[];
}

/** Fetchers for the other ways the full-size box plot can draw the same values, keyed by Group id. */
export interface BoxAlternatives {
  adjusted: () => Promise<Record<string, AdjustedBox>>;
}

export interface Test {
  test: "mannwhitney" | "chi2";
  statistic: number;
  pValue: number;
  effectSize: number;
  effectSigned: number | null;
  significant: boolean;
  higher: string | null;
}

/** Mirrors `MIN_GROUP_CASES` in `src-tauri/src/analysis/mod.rs`: neither test says anything below it. */
export const MIN_GROUP_CASES = 5;

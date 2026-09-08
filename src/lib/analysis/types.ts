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

export interface Test {
  test: "mannwhitney" | "chi2";
  statistic: number;
  pValue: number;
  effectSize: number;
  effectSigned: number | null;
  significant: boolean;
  higher: string | null;
}

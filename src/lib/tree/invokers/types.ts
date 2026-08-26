/**
 * The Comparison Directed Tree as Rust ships it. Every type here mirrors a serde
 * struct in `src-tauri/src/tree/`. The frontend filters and lays out, but never
 * re-aggregates.
 */
export interface ResponseDirectedTree {
  nodes: TreeNode[];
  groups: GroupBlock[];
  caseLevelTests: Record<string, Test>;
  overlapCases: number;
  variantsTotal: number;
  variantsIncluded: number;
  caseCoverage: number;
  cappedByCeiling: boolean;
  transitionTimeBasis: "startComplete" | "completeOnly";
  hasActivityDuration: boolean;
}

export interface TreeNode {
  id: number;
  parent: number | null;
  label: string;
  cases: Record<string, number>;
  eventLevel: Record<string, AttributeBlock>;
  transitionTime: AttributeBlock | null;
  comovement: Comovement[];
  variantKey: string | null;
}

/** One Variant of the filtered log, as `list_variants` ships it. */
export interface ResponseVariantRow {
  key: string;
  activities: string[];
  cases: Record<string, number>;
}

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

export interface Test {
  test: "mannwhitney" | "chi2";
  statistic: number;
  pValue: number;
  effectSize: number;
  effectSigned: number | null;
  significant: boolean;
  higher: string | null;
}

export interface Comovement {
  attributeX: string;
  attributeY: string;
  relationship: "concordant" | "divergent";
}

export interface GroupBlock {
  id: string;
  caseCount: number;
  caseLevel: Record<string, Summary>;
}

/**
* The Comparison Directed Tree as Rust ships it. Every type here mirrors a
* serde struct in `src-tauri/src/tree/`. The frontend filters and lays out, but
* never re-aggregates.
 */
export interface ResponseDirectedTree {
  nodes: TreeNode[];
  groupA: GroupBlock;
  groupB: GroupBlock | null;
  caseLevelTests: Record<string, Test>;
  /** Cases in both Groups. Non-zero breaks the independence both tests assume. */
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
  /** `null` only for the synthetic Start root. */
  parent: number | null;
  label: string;
  groupACases: number;
  groupBCases: number;
  eventLevel: Record<string, AttributeBlock>;
  /** The edge from the parent, not the node. `null` at the root. */
  transitionTime: AttributeBlock | null;
  comovement: Comovement[];
  /**
  * The Variant this node terminates, `null` on every other node. Rust sets it on
  * the key it cut with.
   */
  variantKey: string | null;
}

/** One Variant of the filtered log, as `list_variants` ships it. */
export interface ResponseVariantRow {
  key: string;
  activities: string[];
  casesA: number;
  casesB: number;
}

export interface AttributeBlock {
  groupA: Summary | null;
  groupB: Summary | null;
  /** `null` when either Group has fewer than five cases here. */
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
  /** Magnitude only; `effectSigned` carries the Effect Direction. */
  effectSize: number;
  effectSigned: number | null;
  significant: boolean;
  direction: "aHigher" | "bHigher" | null;
}

export interface Comovement {
  attributeX: string;
  attributeY: string;
  relationship: "concordant" | "divergent";
}

export interface GroupBlock {
  caseCount: number;
  caseLevel: Record<string, Summary>;
}

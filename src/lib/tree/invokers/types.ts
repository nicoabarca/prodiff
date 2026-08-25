/**
* The Comparison Directed Tree as Rust ships it. Every type here mirrors a
* serde struct in `src-tauri/src/tree/`. The frontend filters and lays out, but
* never re-aggregates.
 */
export interface ResponseDirectedTree {
  nodes: TreeNode[];
  /**
   * The Groups on this tree, in the order they were asked for — one ordered
   * array carrying both order and identity, with everything below keyed by id.
   * One entry is single-Group mode, where nothing is compared.
   */
  groups: GroupBlock[];
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
  /** Cases reaching this node, by Group id. */
  cases: Record<string, number>;
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
  /** Cases walking this Variant, by Group id. */
  cases: Record<string, number>;
}

export interface AttributeBlock {
  /** One summary per Group, by id. A Group with nothing here is absent. */
  summaries: Record<string, Summary>;
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
  /**
   * Which Group ranks higher, by id. `null` for chi², which is
   * non-directional. An id rather than "A"/"B" because with three Groups
   * "A higher" would name nothing.
   */
  higher: string | null;
}

export interface Comovement {
  attributeX: string;
  attributeY: string;
  relationship: "concordant" | "divergent";
}

export interface GroupBlock {
  id: string;
  /** Cases in the Group, before the variant cut. */
  caseCount: number;
  caseLevel: Record<string, Summary>;
}

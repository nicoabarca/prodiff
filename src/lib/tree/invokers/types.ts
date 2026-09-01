/**
 * The Comparison Directed Tree as Rust ships it. Every type here mirrors a serde
 * struct in `src-tauri/src/tree/`. The frontend filters and lays out, but never
 * re-aggregates.
 */
import type { AttributeBlock, Summary, Test } from "$lib/analysis/types";

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

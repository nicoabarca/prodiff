/**
 * The Directly-Follows Graph as Rust ships it: whole and unpruned. Every type
 * here mirrors a serde struct in `src-tauri/src/dfg/`.
 *
 * Identity sits outside the maps and measurement inside them. `id`, `label`,
 * `kind`, `source` and `target` cannot differ between Groups, and `significance`
 * and `correlation` are scalars because the simplification runs once over the
 * union: both sides have to see one graph for the comparison to mean anything.
 */
import type { AttributeBlock } from "$lib/analysis/types";

export interface ResponseDfg {
  nodes: DfgNode[];
  edges: DfgEdge[];
  groups: GroupBlock[];
  comparing: boolean;
  overlapCases: number;
  transitionTimeBasis: "startComplete" | "completeOnly";
  hasActivityDuration: boolean;
  skippedCaseLevel: string[];
}

export interface DfgNode {
  id: number;
  label: string;
  kind: NodeKind;
  significance: number;
  counts: Record<string, Counts>;
  attributes: Record<string, AttributeBlock>;
}

export interface DfgEdge {
  source: number;
  target: number;
  significance: number;
  correlation: number;
  counts: Record<string, Counts>;
  /** The wait between the two activities. `null` on Start and End edges. */
  transitionTime: AttributeBlock | null;
}

export interface Counts {
  /** Distinct cases passing through here at least once. */
  cases: number;
  /** Every occurrence. A case visiting the activity twice counts twice. */
  events: number;
}

export type NodeKind = "start" | "end" | "activity";

export interface GroupBlock {
  id: string;
  caseCount: number;
}

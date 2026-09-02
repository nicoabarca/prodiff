/**
 * The Directly-Follows Graph as Rust ships it: the log's distinct trace shapes
 * plus what each activity measures. Every type here mirrors a serde struct in
 * `src-tauri/src/dfg/`.
 *
 * There are no edges in the payload. The frontend folds the variants into nodes
 * and edges for whatever set of activities is on screen, so hiding an activity
 * re-links through it with counts the log actually holds. `transitions` is the
 * one thing measured per pair, and only the pairs the log holds have one.
 */
import type { AttributeBlock } from "$lib/analysis/types";

export interface ResponseDfg {
  nodes: DfgNode[];
  variants: Variant[];
  transitions: Transition[];
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
  /** Over the whole log, whatever is on screen. The Activities slider ranks by these. */
  counts: Record<string, Counts>;
  attributes: Record<string, AttributeBlock>;
}

export interface Variant {
  /** Node ids, in the order they occurred. */
  activities: number[];
  cases: Record<string, number>;
}

export interface Transition {
  source: number;
  target: number;
  wait: AttributeBlock;
}

export interface Counts {
  /** Distinct cases passing through here at least once. */
  cases: number;
  /** Every occurrence. A case visiting the activity twice counts twice. */
  events: number;
}

export interface GroupBlock {
  id: string;
  caseCount: number;
}

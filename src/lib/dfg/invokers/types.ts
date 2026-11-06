/**
 * The Directly-Follows Graph as Rust ships it: the log's distinct trace shapes
 * plus what each activity measures. Every type here mirrors a serde struct in
 * `src-tauri/src/dfg/`.
 *
 * There are no edges in the payload. The frontend folds the variants into nodes
 * and edges for whatever set of activities is on screen, so hiding an activity
 * re-links through it with counts the log actually holds. `transitions` is what
 * is measured per pair, Start and End included, and only the pairs the log
 * holds have one.
 *
 * Activity tests arrive corrected across the activities built. Edge tests
 * arrive uncorrected, `significant` false: `graphFindings` corrects them across
 * the edges drawn.
 */
import type { AttributeBlock } from "$lib/analysis/types";

export type RequestDfgAttribute =
  | { kind: "column"; name: string }
  | { kind: "activityDuration" }
  | { kind: "transitionTime" }
  | { kind: "activityFrequency" }
  | { kind: "edgeFrequency" }
  | { kind: "repetitions" };

export interface ResponseDfg {
  nodes: DfgNode[];
  variants: Variant[];
  transitions: Transition[];
  groups: GroupBlock[];
  caseLevel: Record<string, AttributeBlock>;
}

export type Method = "mannWhitney" | "chi2" | "fisher";

/** How `test.pValue` was computed: `test.test` reads `chi2` under `fisher`. */
export interface PlaceBlock extends AttributeBlock {
  method: Method | null;
}

/**
 * `values` holds each categorical attribute as one two-by-two per value, keyed
 * by attribute then value: of the cases reaching the activity with a value,
 * how many ever held that one there, under "Held" and "Not held".
 */
export interface DfgNode {
  id: number;
  label: string;
  counts: Record<string, Counts>;
  attributes: Record<string, PlaceBlock>;
  values: Record<string, Record<string, PlaceBlock>>;
}

export interface Variant {
  activities: number[];
  cases: Record<string, number>;
}

export interface Transition {
  source: number;
  target: number;
  attributes: Record<string, PlaceBlock>;
}

export interface Counts {
  cases: number;
  events: number;
}

export interface GroupBlock {
  id: string;
  caseCount: number;
}

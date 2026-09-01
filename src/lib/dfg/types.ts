/** What the DFG view decides, all of it drawn from the graph already in hand. */
import type { NodeKind } from "$lib/dfg/invokers/types";

/**
 * Both edges of a conflicting pair survive above this: `A→B` and `B→A` are then
 * a real length-two loop rather than one direction plus its noise.
 */
export const PRESERVE_THRESHOLD = 0.6;

/**
 * One direction wins outright when it beats the other by more than this. Below
 * it the two are concurrent and neither is drawn.
 */
export const RATIO_THRESHOLD = 0.7;

/** Which figure a node or an edge prints on its face. */
export type Measure = "cases" | "events";

export type Direction = "TB" | "LR";

export interface DfgView {
  /**
   * How much of an edge's usefulness is its significance rather than its
   * correlation. 1 weighs frequency alone, 0 closeness alone.
   */
  utilityRatio: number;
  /** Both in `[0, 1]`, both local: what a node keeps, not a global top-N. */
  edgeCutoff: number;
  nodeCutoff: number;
  measure: Measure;
  direction: Direction;
}

export const defaultDfgView: DfgView = {
  utilityRatio: 0.5,
  edgeCutoff: 0.2,
  nodeCutoff: 0,
  measure: "cases",
  direction: "TB"
};

/**
 * Identifies the numbers a build produces, for the in-memory cache. Nothing
 * from `DfgView` belongs here: the view never reaches the backend.
 */
export function dfgKey(groups: string[], attributes: string[]): string {
  return JSON.stringify([groups, [...attributes].sort()]);
}

/** One Group as the canvas needs it: what to call it and what colour to use. */
export interface FaceGroup {
  id: string;
  name: string;
  color: string;
}

export interface DfgNodeData {
  label: string;
  kind: NodeKind;
  groups: FaceGroup[];
  counts: (string | null)[];
  findings: number;
  /** Shades the box. The busiest activity is the darkest. */
  significance: number;
  selected: boolean;
  direction: Direction;
  [key: string]: unknown;
}

export interface DfgEdgeData {
  /** The path ELK routed, in the same space the node positions came from. */
  path: string;
  width: number;
  label: string | null;
  /** A stand-in for a removed node: that pair never happened directly. */
  reconnected: boolean;
  [key: string]: unknown;
}

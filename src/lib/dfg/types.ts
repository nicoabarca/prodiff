/** What the DFG view decides, all of it drawn from the graph already in hand. */

/** The two synthetic nodes. Activities are numbered above them by Rust. */
export const START_ID = 0;
export const END_ID = 1;

export type NodeKind = "start" | "end" | "activity";

/** Which figure a node or an edge prints on its face, and ranks by. */
export type Measure = "cases" | "events";

export type Direction = "TB" | "LR";

export interface DfgView {
  /**
   * Both in `[0, 1]`, both a share of what the log has: 1 draws every activity
   * and every path, 0 the single most travelled of each.
   */
  activities: number;
  paths: number;
  measure: Measure;
  direction: Direction;
}

export const defaultDfgView: DfgView = {
  activities: 1,
  paths: 0.5,
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
  /** Shades the box, against the busiest activity drawn. */
  share: number;
  selected: boolean;
  direction: Direction;
  [key: string]: unknown;
}

export interface DfgEdgeData {
  /** The path ELK routed, in the same space the node positions came from. */
  path: string;
  width: number;
  label: string | null;
  /** Start and End edges are structure rather than behaviour, and drawn dashed. */
  boundary: boolean;
  [key: string]: unknown;
}

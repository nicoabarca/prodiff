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
   * The share of the log's cases the drawing accounts for. 1 draws every trace
   * shape, 0 the single one most cases ran.
   */
  coverage: number;
  /** A share of the paths the chosen shapes hold. 1 draws all of them. */
  paths: number;
  measure: Measure;
  direction: Direction;
}

export const defaultDfgView: DfgView = {
  coverage: 0.8,
  paths: 1,
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
  /** The Group that alone reaches here, or `null` where more than one does. */
  membership: string | null;
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

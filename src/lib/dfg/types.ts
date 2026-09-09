/** What the DFG view decides, all of it drawn from the graph already in hand. */

/** The two synthetic nodes. Activities are numbered above them by Rust. */
export const START_ID = 0;
export const END_ID = 1;

export type NodeKind = "start" | "end" | "activity";

/** Which figure a node or an edge prints on its face, and ranks by. */
export type Measure = "cases" | "events";

export type Direction = "TB" | "LR";

export interface DfgView {
  coverage: number;
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
  counts: Record<string, string | null>;
  findings: number;
  membership: string | null;
  selected: boolean;
  direction: Direction;
  [key: string]: unknown;
}

export interface DfgEdgeData {
  path: string;
  width: number;
  label: string | null;
  boundary: boolean;
  [key: string]: unknown;
}

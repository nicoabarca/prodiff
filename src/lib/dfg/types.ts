/** What the DFG view decides, all of it drawn from the graph already in hand. */

/** The two synthetic nodes. Activities are numbered above them by Rust. */
export const START_ID = 0;
export const END_ID = 1;

export type NodeKind = "start" | "end" | "activity";

/** Which figure a node or an edge prints on its face, and ranks by. */
export type Measure = "cases" | "events";

export type Direction = "TB" | "LR";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One cut of the graph. A split draws both panels from the same one. */
export interface DfgView {
  coverage: number;
  paths: number;
  measure: Measure;
  direction: Direction;
  split: boolean;
}

export const defaultDfgView: DfgView = {
  coverage: 0.8,
  paths: 1,
  measure: "cases",
  direction: "TB",
  split: false
};

/**
 * Which Variants the build is cut to, persisted per project. Empty means every
 * Variant, which is what the graph shows before the panel is ever opened, not
 * "not chosen yet" as it is for the tree.
 */
export interface DfgSettings {
  selectedVariants: string[];
}

export const defaultDfgSettings: DfgSettings = { selectedVariants: [] };

/**
 * Identifies the numbers a build produces, for the in-memory cache. Nothing
 * from `DfgView` belongs here: the view never reaches the backend.
 */
export function dfgKey(groups: string[], attributes: string[], selectedVariants: string[]): string {
  return JSON.stringify([groups, [...attributes].sort(), [...selectedVariants].sort()]);
}

/** One Group as the canvas needs it: what to call it and what colour to use. */
export interface FaceGroup {
  id: string;
  name: string;
  color: string;
}

/**
 * `focus` names the one Group a split panel prints; `null` is the comparative
 * canvas, which prints every Group it was given. `membership` is the Group whose
 * accent the node reads in, `null` being the Original's grey: on a split panel
 * only an activity that Group alone reaches carries an accent.
 */
export interface DfgNodeData {
  label: string;
  kind: NodeKind;
  groups: FaceGroup[];
  counts: Record<string, string | null>;
  shadeStep: number | null;
  findings: number;
  membership: string | null;
  selected: boolean;
  direction: Direction;
  focus: string | null;
  [key: string]: unknown;
}

export interface DfgEdgeData {
  shaft: string;
  head: string;
  width: number;
  label: string | null;
  labelAt: Point;
  boundary: boolean;
  highlighted: boolean;
  [key: string]: unknown;
}

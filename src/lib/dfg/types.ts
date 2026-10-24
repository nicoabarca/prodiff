/** What the DFG view decides, all of it drawn from the graph already in hand. */
import type { NodeDifferences } from "$lib/dfg/utils/findings";
import type { EdgeWait } from "$lib/tree/utils/flow";

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

/** How the graph is drawn. A split draws both panels the same way. */
export interface DfgView {
  measure: Measure;
  direction: Direction;
  split: boolean;
}

export const defaultDfgView: DfgView = {
  measure: "cases",
  direction: "TB",
  split: false
};

/**
 * Which Variants the build is cut to, persisted per project. Empty means "not
 * chosen yet", as it does for the tree: the first load re-seeds it from the
 * coverage default.
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
  differences: NodeDifferences | null;
  membership: string | null;
  selected: boolean;
  direction: Direction;
  highlighted: boolean;
  dimmed: boolean;
  focus: string | null;
  [key: string]: unknown;
}

export interface DfgEdgeData {
  shaft: string;
  head: string;
  width: number;
  waits: EdgeWait[];
  dotted: boolean;
  labelAt: Point;
  boundary: boolean;
  highlighted: boolean;
  dimmed: boolean;
  [key: string]: unknown;
}

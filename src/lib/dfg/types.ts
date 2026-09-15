/** What the DFG view decides, all of it drawn from the graph already in hand. */

/** The two synthetic nodes. Activities are numbered above them by Rust. */
export const START_ID = 0;
export const END_ID = 1;

export type NodeKind = "start" | "end" | "activity";

/** Which figure a node or an edge prints on its face, and ranks by. */
export type Measure = "cases" | "events";

export type Direction = "TB" | "LR";

/**
 * Which layout computes node positions and edge routes. A spike toggle:
 * `elk1` and `elk2` are two competing ELK spacing proposals for spaghetti
 * graphs (see `tierFor` in `layout.ts`) that agree below that size, so a
 * small graph looks the same either way; `graphviz` routes through the
 * Graphviz WASM spike instead.
 */
export type LayoutEngine = "elk1" | "elk2" | "graphviz";

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

export interface DfgView {
  coverage: number;
  paths: number;
  measure: Measure;
  direction: Direction;
  engine: LayoutEngine;
}

export const defaultDfgView: DfgView = {
  coverage: 0.8,
  paths: 1,
  measure: "cases",
  direction: "TB",
  engine: "elk1"
};

/**
 * Which Variants the build is cut to. Persisted per project; empty means
 * "no selection", which is not "not chosen yet" as it is for the tree, but
 * every Variant, matching what the graph shows before this panel is ever
 * opened.
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
  shaft: string;
  head: string;
  width: number;
  label: string | null;
  labelAt: Point;
  boundary: boolean;
  highlighted: boolean;
  [key: string]: unknown;
}

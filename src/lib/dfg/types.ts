/** What the DFG view decides, all of it drawn from the graph already in hand. */
import type { NodeDifferences } from "$lib/dfg/utils/findings";
import type { GroupFocus, Statistic } from "$lib/tree/types";
import type { EdgeWait } from "$lib/tree/utils/flow";

/** The two synthetic nodes. Activities are numbered above them by Rust. */
export const START_ID = 0;
export const END_ID = 1;

/** Derived attributes only the DFG offers. Mirrors `src-tauri/src/dfg/mod.rs`. */
export const ACTIVITY_FREQUENCY = "Activity Frequency";
export const EDGE_FREQUENCY = "Edge Frequency";
export const REPETITIONS = "Repetitions";
export const GRAPH_ATTRIBUTES = [ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS];

export type NodeKind = "start" | "end" | "activity";

/** What activities are shaded by, edges thickened by and the Paths cut ranks by. */
export type Measure = "cases" | "events";

/**
 * What an activity prints under its name. `share` is the Group's cases reaching
 * it over every case it holds; `attribute` reads `DfgView.attribute`.
 */
export type NodeMetric = Measure | "share" | "attribute";

/**
 * What an edge prints beside it. `frequency` is the cases that follow it,
 * `share` those cases over the cases reaching its source, `waiting` reads
 * Transition Time.
 */
export type EdgeLabel = "off" | "frequency" | "share" | "waiting";

/** `scaled` thickens an edge by its count in `DfgView.measure`. */
export type EdgeWidth = "scaled" | "uniform";

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

/**
 * How the graph is drawn. A split draws both panels the same way. `attribute`
 * and `edgeLabel` may name what the graph was not built with; `nodeFigure` and
 * `shownEdgeLabel` say what is drawn then.
 */
export interface DfgView {
  figure: NodeMetric;
  attribute: string | null;
  edgeLabel: EdgeLabel;
  measure: Measure;
  edgeWidth: EdgeWidth;
  statistic: Statistic;
  direction: Direction;
  emphasis: GroupFocus;
  findingsOnly: boolean;
  split: boolean;
}

export const defaultDfgView: DfgView = {
  figure: "cases",
  attribute: null,
  edgeLabel: "waiting",
  measure: "cases",
  edgeWidth: "scaled",
  statistic: "mean",
  direction: "TB",
  emphasis: "all",
  findingsOnly: false,
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
export function dfgKey(
  comparisonKey: string,
  attributes: string[],
  selectedVariants: string[]
): string {
  return JSON.stringify([comparisonKey, [...attributes].sort(), [...selectedVariants].sort()]);
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
 * only an activity that Group alone reaches carries an accent. `added` is the
 * slider move that added the node, which it glows for, or 0.
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
  added: number;
  focus: string | null;
  [key: string]: unknown;
}

/** `added` is the slider move that added the edge, which it glows for, or 0. */
export interface DfgEdgeData {
  shaft: string;
  head: string;
  width: number;
  stroke: string | null;
  label: EdgeWait[];
  dotted: boolean;
  labelAt: Point;
  boundary: boolean;
  clickable: boolean;
  highlighted: boolean;
  dimmed: boolean;
  added: number;
  [key: string]: unknown;
}

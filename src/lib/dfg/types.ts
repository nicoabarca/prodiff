/** What the DFG view decides, all of it drawn from the graph already in hand. */

import type { Ramp } from "$lib/groups/utils/shade";

/** The two synthetic nodes. Activities are numbered above them by Rust. */
export const START_ID = 0;
export const END_ID = 1;

export type NodeKind = "start" | "end" | "activity";

/** The unit the fold counts in: a case once, or every occurrence of it. */
export type Frequency = "cases" | "events";

/**
 * What a node prints on its face and shades by. A frequency is read off the
 * fold; an attribute is read off the Summary Rust shipped for it, which exists
 * only while that attribute is among the ones tested.
 */
export type Measure = { kind: "cases" } | { kind: "events" } | { kind: "attribute"; name: string };

/**
 * What an edge's width scales by. A wait is the mean Waiting Time Rust measured
 * for the pair, so it needs Waiting Time among the attributes and falls back to
 * the frequency on a pair the log never held.
 */
export type EdgeMeasure = "frequency" | "wait";

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
  edge: EdgeMeasure;
  edgeLabels: boolean;
  ramp: Ramp;
  direction: Direction;
  split: boolean;
}

export const defaultDfgView: DfgView = {
  coverage: 0.8,
  paths: 1,
  measure: { kind: "cases" },
  edge: "frequency",
  edgeLabels: false,
  ramp: "group",
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
  figures: Record<string, string | null>;
  shadeStep: number | null;
  ramp: Ramp;
  findings: number;
  membership: string | null;
  selected: boolean;
  hovered: boolean;
  direction: Direction;
  highlighted: boolean;
  dimmed: boolean;
  focus: string | null;
  [key: string]: unknown;
}

/**
 * The mean wait an edge prints, one part per Group that measured one, each in
 * that Group's colour. `shared` says every Group waited the same, so one figure
 * stands for all of them and the dots alone say whose it is.
 */
export interface WaitLabel {
  parts: { id: string; color: string; text: string }[];
  shared: boolean;
}

export interface DfgEdgeData {
  shaft: string;
  head: string;
  width: number;
  label: WaitLabel | null;
  labelAt: Point;
  boundary: boolean;
  highlighted: boolean;
  dimmed: boolean;
  [key: string]: unknown;
}

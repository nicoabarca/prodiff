/**
 * What the Distributions view decides — the Scope it counts under, the encoding
 * a duration is read in, and the shapes the grid draws.
 */
import type { Test } from "$lib/tree/invokers/types";

/**
 * Which of a node's cases' events are counted. The cases are the same either
 * way — only their events differ, which is why the drawer states the Scope on
 * the header and again on every card.
 */
export type Scope = "atStep" | "wholeCase";

export const SCOPES: Scope[] = ["atStep", "wholeCase"];

export const SCOPE_LABEL: Record<Scope, string> = {
  atStep: "This step",
  wholeCase: "Whole case"
};

/**
 * What the Scope actually counts, in the user's terms.
 *
 * Phrased in events per case, because that is the only thing the Scope decides.
 * "At this step" read as a filter on *cases* — it is not; the same cases are
 * behind both readings, and what changes is how many of each one's events get
 * counted. The control says "Count events from" for the same reason.
 */
export const SCOPE_HINT: Record<Scope, string> = {
  atStep: "one event per case, the one at this activity",
  wholeCase: "every event of those same cases, at every activity"
};

/** How a duration card draws its numbers. */
export type Encoding = "ecdf" | "box" | "logBins";

export const ENCODINGS: Encoding[] = ["ecdf", "box", "logBins"];

export const ENCODING_LABEL: Record<Encoding, string> = {
  ecdf: "Curve",
  box: "Box",
  logBins: "Bars"
};

/**
 * The selected option of a plot control, in the theme's indigo. The default
 * `on` state is a grey fill, easy to miss on a bar of small outlined buttons —
 * and these decide what every card on the grid is counting.
 *
 * The left border is the fiddly part. In a joined outline group every item but
 * the first is `border-l-0` and leans on its neighbour's right border, so a
 * selected middle or last item had three indigo sides and a grey one. It gets
 * its own border back, shifted a pixel left to sit on top of the neighbour's
 * rather than widen the group, and raised so indigo wins where they overlap.
 *
 * The full variant chain is repeated rather than shortened: the `border-l-0` it
 * has to beat carries all of it, and a shorter selector loses on specificity
 * however late it appears.
 */
export const PLOT_TOGGLE = [
  "data-[state=on]:border-primary",
  "data-[state=on]:text-primary",
  "data-[state=on]:bg-primary/5",
  "data-[state=on]:font-semibold",
  "data-[state=on]:z-10",
  "group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:data-[state=on]:not-first:border-l",
  "group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:data-[state=on]:not-first:-ml-px"
].join(" ");

/** What each encoding is for, on the control that switches between them. */
export const ENCODING_HINT: Record<Encoding, string> = {
  ecdf: "Cumulative curve: the whole difference at every percentile",
  box: "Box plot: median, spread and outliers at a glance",
  logBins: "Log-width bars: one bar per order of magnitude, tail included"
};

/** Categories a card shows before the rest fold into `Other`. */
export const TOP_CATEGORIES = 12;

/** One bar: a label and the two Groups' counts. */
export interface Bar {
  label: string;
  a: number;
  b: number;
  /** Set on the `Other` bucket, which is a fold rather than a value. */
  collapsed?: number;
}

/** One column of the cumulative curve: a duration and each Group's share. */
export interface CurveRow {
  value: number;
  /** 0 to 1, or `null` where that Group has no values at all. */
  a: number | null;
  b: number | null;
}

/** How the Distributions grid orders its cards. */
export type Sort = "difference" | "name";

/** One card in the grid, before its numbers have arrived. */
export interface GridAttribute {
  name: string;
  /** The node's Significance Test, when one ran for this attribute here. */
  test: Test | null;
  /** False for an attribute the build never tested, added by hand. */
  inBuild: boolean;
}

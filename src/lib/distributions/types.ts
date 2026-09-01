/**
 * What the Distributions view decides: the Scope it counts under, the encoding a
 * duration is read in, and the shapes the grid draws.
 */
import type { Test } from "$lib/analysis/types";

export type Scope = "atStep" | "wholeCase";

export const SCOPES: Scope[] = ["atStep", "wholeCase"];

export const SCOPE_LABEL: Record<Scope, string> = {
  atStep: "This step",
  wholeCase: "Whole case"
};

/** What the Scope counts, phrased in events per case. */
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
 * The selected option of a plot control. The full variant chain is repeated
 * because the `border-l-0` it has to beat carries all of it, and a shorter
 * selector loses on specificity.
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

/** One bar: a label and every Group's count, keyed by Group id. */
export interface Bar {
  label: string;
  counts: Record<string, number>;
  collapsed?: number;
}

/** One column of the cumulative curve: a duration and each Group's share, keyed by Group id. */
export interface CurveRow {
  value: number;
  shares: Record<string, number | null>;
}

/** How the Distributions grid orders its cards. */
export type Sort = "difference" | "name";

/** One card in the grid, before its numbers have arrived. */
export interface GridAttribute {
  name: string;
  test: Test | null;
  inBuild: boolean;
}

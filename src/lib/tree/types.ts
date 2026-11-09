/** What the tree view decides, and what a build is asked for. */

/**
 * The build inputs, persisted per project. An empty `selectedVariants` means
 * "not chosen yet", and `build` sends `null` so the backend picks its own.
 */
export interface TreeSettings {
  attributes: string[];
  selectedVariants: string[];
  attributesChosen: boolean;
}

export const defaultTreeSettings: TreeSettings = {
  attributes: [],
  selectedVariants: [],
  attributesChosen: false
};

/** What a cold build and a freshly seeded picker both open on. */
export const DEFAULT_COVERAGE = 0.8;

/**
 * What the node face shows under the activity name. `share` is a Group's cases
 * at the node over its whole case count; `attribute` reads `TreeView.attribute`.
 */
export type NodeMetric = "cases" | "share" | "attribute";

/** Which figure of a number's summary the node faces and the edge labels show. */
export type Statistic = "mean" | "median";

/** `cases` scales an edge by the volume flowing through it. */
export type EdgeWidth = "cases" | "uniform";

/**
 * Which nodes stay at full opacity; the rest are dimmed, never removed. `"all"`,
 * `"shared"` for the nodes every Group reaches, or one Group's id for the nodes
 * that Group reaches.
 */
export type GroupFocus = "all" | "shared" | (string & {});

/**
 * What the view decides, all of it drawn from the tree already in hand.
 */
export interface TreeView {
  significantOnly: boolean;
  collapsed: Set<number>;
  metric: NodeMetric;
  attribute: string | null;
  statistic: Statistic;
  focus: GroupFocus;
  edgeLabels: boolean;
  edgeWidth: EdgeWidth;
}

export const defaultTreeView: TreeView = {
  significantOnly: false,
  collapsed: new Set(),
  metric: "cases",
  attribute: null,
  statistic: "mean",
  focus: "all",
  edgeLabels: true,
  edgeWidth: "cases"
};

/** How big a difference is, in words. */
export type EffectBand = "negligible" | "small" | "moderate" | "large";

/**
 * Where an attribute stands in the panel. Only a test that failed, or never
 * ran, leaves the list; size never files a passing test away.
 */
export type Standing = "finding" | "weak" | "untested";

export interface Visible {
  ids: Set<number>;
  hiddenBelow: Map<number, number>;
  variantsShown: number;
  variantsHidden: number;
  casesShown: number;
  cases: Map<number, Record<string, number>>;
}

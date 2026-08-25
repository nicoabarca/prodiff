/** What the tree view decides, and what a build is asked for. */

/**
 * The build inputs, persisted per project. An empty `selectedVariants` means
 * "not chosen yet", and `build` sends `null` so the backend picks its own.
 */
export interface TreeSettings {
  attributes: string[];
  selectedVariants: string[];
}

export const defaultTreeSettings: TreeSettings = { attributes: [], selectedVariants: [] };

/** What a cold build and a freshly seeded picker both open on. */
export const DEFAULT_COVERAGE = 0.8;

export type Direction = "TB" | "LR";

/** What the node face shows under the activity name: `cases`, a Group id, or an attribute. */
export type Secondary = "cases" | (string & {});

/**
 * Which Groups stay at full opacity; the rest are dimmed, never removed.
 * `"all"`, `"shared"`, or one Group's id.
 */
export type GroupFocus = "all" | "shared" | (string & {});

/**
 * What the view decides, all of it drawn from the tree already in hand.
 */
export interface TreeView {
  /** Keep only Variants containing at least one significant Significance Test. */
  significantOnly: boolean;
  /** Nodes whose subtree is folded away. */
  collapsed: Set<number>;
  direction: Direction;
  secondary: Secondary;
  focus: GroupFocus;
  /** Mean Transition Time on each edge. Only has an effect when it was built. */
  edgeLabels: boolean;
}

export const defaultTreeView: TreeView = {
  significantOnly: false,
  collapsed: new Set(),
  direction: "TB",
  secondary: "cases",
  focus: "all",
  edgeLabels: true
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
  /** Nodes folded into a collapsed ancestor, for the "+n" badge. */
  hiddenBelow: Map<number, number>;
  variantsShown: number;
  variantsHidden: number;
  /** Cases on the Variants that survived, both Groups together. */
  casesShown: number;
  /**
   * Per-node case counts by Group id, restricted to the surviving Variants. A
   * node's own `cases` sums over every Variant the tree was built with.
   */
  cases: Map<number, Record<string, number>>;
}

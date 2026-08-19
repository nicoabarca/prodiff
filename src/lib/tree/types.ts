/** What the tree view decides, and what a build is asked for. */

/**
 * The build inputs, persisted per project. `selectedVariants` lives here rather
 * than in `TreeView` because it is one: the cut runs before any aggregation, so
 * the Significance Tests describe exactly these Variants. Hand-picking a set is
 * also expensive enough to be worth surviving a restart.
 *
 * Empty means "not chosen yet" — the picker seeds it from the log on first
 * load, and `build` sends `null` so the backend opens on its own default.
 */
export interface TreeSettings {
  attributes: string[];
  selectedVariants: string[];
}

export const defaultTreeSettings: TreeSettings = { attributes: [], selectedVariants: [] };

/** What a cold build and a freshly seeded picker both open on. */
export const DEFAULT_COVERAGE = 0.8;

export type Direction = "TB" | "LR";

/** What the node face shows under the activity name. */
export type Secondary = "cases" | "casesA" | "casesB" | (string & {});

/** Which Groups stay at full opacity; the rest are dimmed, never removed. */
export type GroupFocus = "all" | "a" | "b" | "shared";

/**
 * What the view decides, all of it drawn from the tree already in hand. Which
 * Variants to include is *not* here — it is a build input and lives in
 * `TreeSettings`, because the Significance Tests have to be computed over the
 * Variants included in order to describe them.
 */
export interface TreeView {
  /**
   * Keep only Variants containing at least one significant Significance Test.
   * Stays a view filter rather than moving into the picker: significance only
   * exists after a build, so nothing choosing Variants beforehand could ask it.
   */
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
 * Where an attribute stands in the panel. A test that passed is a finding
 * whatever its size — the magnitude chip says how big it is, so filing the
 * small ones away would hide the very comparison the chip exists to make.
 * Only a test that failed, or never ran, leaves the list.
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
   * Per-node case counts restricted to the surviving Variants. A node's own
   * `groupACases`/`groupBCases` sum over every Variant the built tree ever
   * had — right for a node that is one Variant's private tail, wrong for a
   * shared ancestor once the slider prunes away some of its siblings.
   */
  cases: Map<number, { groupACases: number; groupBCases: number }>;
}

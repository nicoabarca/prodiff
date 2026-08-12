import { invoke } from "@tauri-apps/api/core";
import type { ColumnMapping } from "$lib/column-mapping";
import type { Filter } from "$lib/filters";
import type { Project } from "$lib/types";

/**
 * The Comparison Directed Tree as Rust ships it — mirrors `DirectedTree` in
 * `src-tauri/src/tree/mod.rs`. Everything the view can show arrives in one
 * payload: the frontend filters, toggles and lays out, but never re-aggregates.
 */
export interface DirectedTree {
  nodes: TreeNode[];
  groupA: GroupBlock;
  groupB: GroupBlock | null;
  caseLevelTests: Record<string, Test>;
  /** Cases in both Groups. Non-zero breaks the independence both tests assume. */
  overlapCases: number;
  variantsTotal: number;
  variantsIncluded: number;
  caseCoverage: number;
  cappedByCeiling: boolean;
  transitionTimeBasis: "startComplete" | "completeOnly";
  hasActivityDuration: boolean;
}

export interface TreeNode {
  id: number;
  /** `null` only for the synthetic Start root. */
  parent: number | null;
  label: string;
  groupACases: number;
  groupBCases: number;
  eventLevel: Record<string, AttributeBlock>;
  /** The edge from the parent, not the node — `null` at the root. */
  transitionTime: AttributeBlock | null;
  comovement: Comovement[];
  /**
   * The Variant this node terminates, `null` on every other node. Rust sets it
   * on the key it actually cut with, so matching a leaf against the selection
   * never depends on the frontend re-joining labels the same way.
   */
  variantKey: string | null;
}

/** One Variant of the filtered log, as `list_variants` ships it. */
export interface VariantRow {
  key: string;
  activities: string[];
  casesA: number;
  casesB: number;
}

/**
 * Every Variant of the filtered log, most cases first. Independent of the
 * build, so the picker works before the first one — and reaches Variants no
 * build included, which is the whole reason it isn't derived from the tree.
 */
export function listVariants(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null
): Promise<VariantRow[]> {
  return invoke<VariantRow[]>("list_variants", {
    projectId: project.id,
    groupA,
    groupB,
    columns: project.columns
  });
}

/** Cases on a Variant across both Groups — the ranking the backend cut uses. */
export function variantCases(row: VariantRow): number {
  return row.casesA + row.casesB;
}

/**
 * The fewest Variants holding `coverage` of the cases, biggest first. Mirrors
 * the backend's cold-build pick, so seeding the picker and letting Rust choose
 * land on the same set.
 */
export function variantsCovering(rows: VariantRow[], coverage: number): Set<string> {
  const total = rows.reduce((sum, row) => sum + variantCases(row), 0);
  const target = total * coverage;
  const keys = new Set<string>();
  let covered = 0;
  for (const row of rows) {
    // At least one always survives: an empty selection blocks the build.
    if (covered >= target && keys.size > 0) break;
    covered += variantCases(row);
    keys.add(row.key);
  }
  return keys;
}

export interface AttributeBlock {
  groupA: Summary | null;
  groupB: Summary | null;
  /** `null` when either Group has fewer than five cases here. */
  test: Test | null;
}

export type Summary =
  | {
      type: "numerical";
      n: number;
      mean: number;
      std: number;
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      /** Tukey whiskers — the extreme observations within 1.5·IQR of the box. */
      whiskerLow: number;
      whiskerHigh: number;
      /** Observations past the whiskers, counted rather than listed. */
      outliersLow: number;
      outliersHigh: number;
    }
  | { type: "categorical"; n: number; counts: Record<string, number> };

export interface Test {
  test: "mannwhitney" | "chi2";
  statistic: number;
  pValue: number;
  /** Magnitude only; `effectSigned` carries the Effect Direction. */
  effectSize: number;
  effectSigned: number | null;
  significant: boolean;
  direction: "aHigher" | "bHigher" | null;
}

export interface Comovement {
  attributeX: string;
  attributeY: string;
  relationship: "concordant" | "divergent";
}

export interface GroupBlock {
  caseCount: number;
  caseLevel: Record<string, Summary>;
}

/** Derived attributes — not columns, but selectable like any other. */
export const ACTIVITY_DURATION = "Activity Duration";
export const TRANSITION_TIME = "Transition Time";

/**
 * What the user can ask the backend to test. Columns hidden from the project
 * are left out: a column the user has taken off screen everywhere else has no
 * business consuming test budget here.
 */
export function attributeOptions(columns: ColumnMapping[], hidden: string[] = []): string[] {
  const mapped = columns
    .filter((c) => c.role === "other" && !hidden.includes(c.name))
    .map((c) => c.name);
  const hasStart = columns.some((c) => c.role === "start_timestamp");
  return [...mapped, ...(hasStart ? [ACTIVITY_DURATION] : []), TRANSITION_TIME];
}

export function isNumericAttribute(columns: ColumnMapping[], attribute: string): boolean {
  if (attribute === ACTIVITY_DURATION || attribute === TRANSITION_TIME) return true;
  const column = columns.find((c) => c.name === attribute);
  return column?.type === "integer" || column?.type === "float";
}

/** Attributes whose values are milliseconds, so the panel formats them as durations. */
export function isDurationAttribute(attribute: string): boolean {
  return attribute === ACTIVITY_DURATION || attribute === TRANSITION_TIME;
}

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

/**
 * Builds the tree. Both chains arrive already composed (base first) — the
 * ordering rule lives in `effectiveChain`, as it does for every other command.
 * `groupB` is `null` in one-Group mode, where nothing is compared.
 *
 * `settings.selectedVariants` is which Variants to include, by key. The cut
 * runs before anything is aggregated, so every Significance Test describes the
 * Variants asked for — an empty set sends `null`, which lets the backend open
 * on the ones covering most of the cases.
 */
export function directedTree(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null,
  settings: TreeSettings
): Promise<DirectedTree> {
  return invoke<DirectedTree>("directed_tree", {
    projectId: project.id,
    groupA,
    groupB,
    attributes: settings.attributes,
    columns: project.columns,
    variants: settings.selectedVariants.length > 0 ? settings.selectedVariants : null
  });
}

/**
 * Identifies the numbers a build produces, for the in-memory cache. Sorted, so
 * checking Variants in a different order doesn't read as a different tree.
 */
export function treeKey(
  groupA: Filter[],
  groupB: Filter[] | null,
  settings: TreeSettings
): string {
  return JSON.stringify([
    groupA,
    groupB,
    settings.attributes,
    [...settings.selectedVariants].sort()
  ]);
}

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

export function nodeCases(node: TreeNode): number {
  return node.groupACases + node.groupBCases;
}

/** True when any attribute at this node came out significant. */
export function hasSignificant(node: TreeNode): boolean {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  return blocks.some((block) => block?.test?.significant);
}

/** How big a difference is, in words. */
export type EffectBand = "negligible" | "small" | "moderate" | "large";

/**
 * Cohen's conventional r bands. They apply unchanged to the rank-biserial
 * correlation Mann-Whitney ships and to Cramér's V at one degree of freedom,
 * which two Groups always give — so one legend covers both tests.
 */
export function effectBand(effectSize: number): EffectBand {
  if (effectSize < 0.1) return "negligible";
  if (effectSize < 0.3) return "small";
  if (effectSize < 0.5) return "moderate";
  return "large";
}

/** The band's step on the `--effect-*` ramp, 1 (negligible) to 4 (large). */
export function effectStep(effectSize: number): 1 | 2 | 3 | 4 {
  return { negligible: 1, small: 2, moderate: 3, large: 4 }[effectBand(effectSize)] as 1 | 2 | 3 | 4;
}

/**
 * Where an attribute stands in the panel. A test that passed is a finding
 * whatever its size — the magnitude chip says how big it is, so filing the
 * small ones away would hide the very comparison the chip exists to make.
 * Only a test that failed, or never ran, leaves the list.
 */
export type Standing = "finding" | "weak" | "untested";

export function standing(block: AttributeBlock): Standing {
  if (!block.test) return "untested";
  return block.test.significant ? "finding" : "weak";
}

/**
 * The strongest effect among the significant tests at a node, or `null` when
 * none passed. This is what the node's badge is coloured by: the count alone
 * says how many differences are here, never whether any of them matter.
 */
export function peakEffect(node: TreeNode): number | null {
  const blocks = [...Object.values(node.eventLevel), node.transitionTime];
  const effects = blocks
    .filter((block) => block?.test?.significant)
    .map((block) => block!.test!.effectSize);
  return effects.length > 0 ? Math.max(...effects) : null;
}

/**
 * Every attribute at a node — Transition Time last, as the edge into it —
 * ordered strongest first and split by Standing, which is the order the detail
 * panel reads in. Untested blocks sort below every tested one.
 */
export function rankedBlocks(node: TreeNode): Record<Standing, [string, AttributeBlock][]> {
  const entries: [string, AttributeBlock][] = Object.entries(node.eventLevel);
  if (node.transitionTime) entries.push([TRANSITION_TIME, node.transitionTime]);
  entries.sort((x, y) => (y[1].test?.effectSize ?? -1) - (x[1].test?.effectSize ?? -1));
  const of = (which: Standing) => entries.filter(([, block]) => standing(block) === which);
  return { finding: of("finding"), weak: of("weak"), untested: of("untested") };
}

export function isDivergent(node: TreeNode): boolean {
  return node.comovement.some((pair) => pair.relationship === "divergent");
}

/** Which Groups reach a node — the tree's primary colour channel. */
export function membership(node: TreeNode): "a" | "b" | "shared" {
  if (node.groupBCases === 0) return "a";
  if (node.groupACases === 0) return "b";
  return "shared";
}

export function children(tree: DirectedTree): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const node of tree.nodes) {
    if (node.parent === null) continue;
    const siblings = map.get(node.parent);
    if (siblings) siblings.push(node.id);
    else map.set(node.parent, [node.id]);
  }
  return map;
}

/** The path from the root down to `id`, inclusive — a node's full trace. */
export function pathTo(tree: DirectedTree, id: number): TreeNode[] {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const path: TreeNode[] = [];
  let current: TreeNode | undefined = byId.get(id);
  while (current) {
    path.unshift(current);
    current = current.parent === null ? undefined : byId.get(current.parent);
  }
  return path;
}

/**
 * How far past the step its context reaches. One level answers "and then what?"
 * without the rail turning back into the tree the view exists to get away from.
 * Any depth works, `Infinity` included — the walk stops where this says, so
 * widening it is this number and nothing else.
 */
export const CONTEXT_DEPTH = 1;

/**
 * The nodes one step is read in the context of: its own trace down from the
 * root, and what the cases reaching it go on to do next.
 *
 * Siblings on other traces are left out on purpose. They are other cases'
 * steps, and nothing the Distributions grid says describes them — showing them
 * would put the numbers next to activities they never counted.
 */
export function stepContext(
  tree: DirectedTree,
  id: number,
  depth: number = CONTEXT_DEPTH
): Set<number> {
  const context = new Set(pathTo(tree, id).map((node) => node.id));
  const kids = children(tree);
  let frontier = kids.get(id) ?? [];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: number[] = [];
    for (const child of frontier) {
      context.add(child);
      next.push(...(kids.get(child) ?? []));
    }
    frontier = next;
  }
  return context;
}

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

/** One leaf per Variant: every path from the root ends at exactly one. */
export function leaves(tree: DirectedTree): TreeNode[] {
  const kids = children(tree);
  return tree.nodes.filter((n) => !kids.has(n.id));
}

/** Cases in both Groups before any cut — the denominator for every share. */
export function totalCases(tree: DirectedTree): number {
  return Number(tree.groupA.caseCount) + Number(tree.groupB?.caseCount ?? 0);
}

/**
 * Which nodes render. Pruning works on whole Variants — a path from root to
 * leaf — rather than on nodes, so a surviving path is always a trace some case
 * actually followed. Collapsing is applied afterwards: it hides a subtree
 * without claiming those Variants don't exist.
 *
 * `selected` is the picker's set. Unchecking a Variant prunes it here at once,
 * but the aggregates on the nodes above it still describe it until the next
 * build — which is why doing so marks the tree stale.
 */
export function visibleNodes(
  tree: DirectedTree,
  view: TreeView,
  selected: Set<string>
): Visible {
  const kids = children(tree);
  const all = leaves(tree);

  // An empty selection means nothing has been chosen yet, so the built tree
  // already is the selection — filtering on it would blank the canvas.
  const chosen = (leaf: TreeNode) =>
    selected.size === 0 || (leaf.variantKey !== null && selected.has(leaf.variantKey));

  // Biggest Variants first. Case count then id keeps ties stable across renders.
  const ranked = all
    .filter(chosen)
    .filter((leaf) => !view.significantOnly || pathTo(tree, leaf.id).some(hasSignificant))
    .sort((a, b) => nodeCases(b) - nodeCases(a) || a.id - b.id);

  const kept = new Set<number>();
  const cases = new Map<number, { groupACases: number; groupBCases: number }>();
  let casesShown = 0;
  for (const leaf of ranked) {
    casesShown += nodeCases(leaf);
    for (const node of pathTo(tree, leaf.id)) {
      kept.add(node.id);
      const acc = cases.get(node.id) ?? { groupACases: 0, groupBCases: 0 };
      acc.groupACases += leaf.groupACases;
      acc.groupBCases += leaf.groupBCases;
      cases.set(node.id, acc);
    }
  }
  const variantsShown = ranked.length;

  // A collapsed node stays; everything under it goes, and the count of what
  // went is what the badge shows.
  const hiddenBelow = new Map<number, number>();
  const ids = new Set(kept);
  for (const id of view.collapsed) {
    if (!kept.has(id)) continue;
    let hidden = 0;
    const stack = [...(kids.get(id) ?? [])];
    while (stack.length) {
      const next = stack.pop() as number;
      if (!kept.has(next)) continue;
      ids.delete(next);
      hidden += 1;
      stack.push(...(kids.get(next) ?? []));
    }
    if (hidden > 0) hiddenBelow.set(id, hidden);
  }
  // Nested collapses can strip a node that also carries a badge; drop those.
  for (const id of [...hiddenBelow.keys()]) if (!ids.has(id)) hiddenBelow.delete(id);

  return {
    ids,
    hiddenBelow,
    variantsShown,
    variantsHidden: all.length - variantsShown,
    casesShown,
    cases
  };
}

/**
 * Distance from the synthetic Start root — 0 at the root, 1 at the first
 * activity. This is the event index a node's own step sits at, offset by the
 * root: the node at depth `d` is the `d`th activity of every case reaching it.
 */
export function nodeDepth(tree: DirectedTree, id: number): number {
  return pathTo(tree, id).length - 1;
}

/**
 * The Variant keys of every leaf under `id` that survived pruning — how a node
 * is named to the backend when asking for its Distributions.
 *
 * Keyed off `visible.cases` rather than `visible.ids`: `cases` holds every node
 * on a surviving path, while `ids` has collapsed subtrees stripped out. Folding
 * a subtree away is a rendering choice and must not change which cases the
 * charts describe.
 */
export function subtreeVariants(tree: DirectedTree, visible: Visible, id: number): string[] {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const kids = children(tree);
  const keys: string[] = [];
  const stack = [id];
  while (stack.length) {
    const next = stack.pop() as number;
    if (!visible.cases.has(next)) continue;
    const key = byId.get(next)?.variantKey;
    if (key !== null && key !== undefined) keys.push(key);
    stack.push(...(kids.get(next) ?? []));
  }
  return keys;
}

/**
 * The nodes one Variant runs through, restricted to what is on screen. Empty
 * when that Variant isn't in this tree — unselected, pruned, or built before
 * it existed — so hovering it highlights nothing rather than lying about a
 * partial path.
 */
export function variantPath(tree: DirectedTree, visible: Visible, key: string): Set<number> {
  const leaf = tree.nodes.find((node) => node.variantKey === key);
  if (!leaf || !visible.ids.has(leaf.id)) return new Set();
  return new Set(pathTo(tree, leaf.id).map((node) => node.id));
}

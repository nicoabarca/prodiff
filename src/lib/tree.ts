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

export interface TreeSettings {
  attributes: string[];
}

export const defaultTreeSettings: TreeSettings = { attributes: [] };

/**
 * Builds the tree. Both chains arrive already composed (base first) — the
 * ordering rule lives in `effectiveChain`, as it does for every other command.
 * `groupB` is `null` in one-Group mode, where nothing is compared.
 *
 * `maxVariants` is how many Variants to include. It cuts before anything is
 * aggregated, so every Significance Test describes the Variants asked for —
 * `null` lets the backend open on the ones covering most of the cases.
 */
export function directedTree(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null,
  settings: TreeSettings,
  maxVariants: number | null
): Promise<DirectedTree> {
  return invoke<DirectedTree>("directed_tree", {
    projectId: project.id,
    groupA,
    groupB,
    attributes: settings.attributes,
    columns: project.columns,
    maxVariants
  });
}

/** Identifies the numbers a build produces, for the in-memory cache. */
export function treeKey(
  groupA: Filter[],
  groupB: Filter[] | null,
  settings: TreeSettings,
  maxVariants: number
): string {
  return JSON.stringify([groupA, groupB, settings.attributes, maxVariants]);
}

export type Direction = "TB" | "LR";

/** What the node face shows under the activity name. */
export type Secondary = "cases" | "casesA" | "casesB" | (string & {});

/** Which Groups stay at full opacity; the rest are dimmed, never removed. */
export type GroupFocus = "all" | "a" | "b" | "shared";

/**
 * What the view decides. All of it but `maxVariants` is drawn from the tree
 * already in hand; `maxVariants` is a build input, because the Significance
 * Tests have to be computed over the Variants included to describe them.
 */
export interface TreeView {
  /**
   * How many Variants to include, biggest first. Changing it rebuilds — the
   * local prune below is the preview until the new numbers land.
   */
  maxVariants: number;
  /** Variants whose end node has fewer than this many cases are dropped whole. */
  minCases: number;
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
  maxVariants: Number.MAX_SAFE_INTEGER,
  minCases: 0,
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
 * Which nodes render. Both pruning filters work on whole Variants — a path from
 * root to leaf — rather than on nodes, so a surviving path is always a trace
 * some case actually followed. Collapsing is applied afterwards: it hides a
 * subtree without claiming those Variants don't exist.
 */
export function visibleNodes(tree: DirectedTree, view: TreeView): Visible {
  const kids = children(tree);
  const all = leaves(tree);

  // Biggest Variants first, so the slider always cuts the tail rather than an
  // arbitrary slice. Case count then label keeps ties stable across renders.
  const ranked = all
    .filter((leaf) => nodeCases(leaf) >= view.minCases)
    .filter((leaf) => !view.significantOnly || pathTo(tree, leaf.id).some(hasSignificant))
    .sort((a, b) => nodeCases(b) - nodeCases(a) || a.id - b.id)
    .slice(0, Math.max(1, view.maxVariants));

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

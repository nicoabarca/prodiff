/**
 * Distributions — the value counts behind one node's charts. Mirrors
 * `NodeDistributions` in `src-tauri/src/tree/distributions.rs`.
 *
 * Fetched per selected node rather than carried in the tree payload; see
 * `docs/adr/0003-query-distributions-on-demand.md`. As everywhere else in this
 * app, Rust aggregates and the frontend only draws — the one thing computed
 * here is the `Other` bucket, and only because its size follows a cutoff the
 * user can change without another round trip.
 */

import { invoke } from "@tauri-apps/api/core";
import { formatDecimal, formatDuration } from "$lib/format";
import { isDurationAttribute } from "$lib/tree";
import type { Filter } from "$lib/filters";
import type { Project } from "$lib/types";

/**
 * Which of a node's cases' events are counted. The cases are the same either
 * way — only their events differ, which is why the drawer states the Scope on
 * the header and again on every card.
 */
export type Scope = "atStep" | "wholeCase";

export const SCOPES: Scope[] = ["atStep", "wholeCase"];

export const SCOPE_LABEL: Record<Scope, string> = {
  atStep: "At this step",
  wholeCase: "Whole case"
};

/** What the Scope actually counts, in the user's terms. */
export const SCOPE_HINT: Record<Scope, string> = {
  atStep: "only the event at this activity, for the cases passing through it",
  wholeCase: "every event of those same cases, at every activity"
};

export interface CategoryCount {
  value: string;
  a: number;
  b: number;
}

export type Distribution =
  | {
      type: "categorical";
      /** Biggest first by pooled count, capped at 200 by the backend. */
      values: CategoryCount[];
      /** Distinct values counted, before any cut. */
      distinct: number;
      /** Every value counted, cut ones included — what makes `Other` exact. */
      totalA: number;
      totalB: number;
    }
  | {
      type: "numerical";
      /** `edges.length === countsA.length + 1`; shared by both Groups. */
      edges: number[];
      countsA: number[];
      countsB: number[];
      nA: number;
      nB: number;
    }
  | { type: "empty" };

export interface NodeDistributions {
  /** In the order the attributes were requested, so the cards keep theirs. */
  attributes: [string, Distribution][];
  casesA: number;
  casesB: number;
  eventsA: number;
  eventsB: number;
}

/** Categories a card shows before the rest fold into `Other`. */
export const TOP_CATEGORIES = 12;

/**
 * One node's Distributions. `variants` is the Variant key of every visible leaf
 * under the node and `depth` its distance from the Start root — the pair that
 * identifies the node without either side re-deriving it from activity labels.
 */
export function nodeDistributions(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null,
  attributes: string[],
  variants: string[],
  depth: number,
  scope: Scope
): Promise<NodeDistributions> {
  return invoke<NodeDistributions>("node_distributions", {
    projectId: project.id,
    groupA,
    groupB,
    columns: project.columns,
    attributes,
    variants,
    depth,
    scope
  });
}

/** One bar: a label and the two Groups' counts. */
export interface Bar {
  label: string;
  a: number;
  b: number;
  /** Set on the `Other` bucket, which is a fold rather than a value. */
  collapsed?: number;
}

/**
 * The bars for a categorical Distribution. Everything past the cutoff folds
 * into one `Other` bar whose counts come from the totals rather than from the
 * rows on screen — so it stays exact even though the backend capped the list
 * long before the cutoff did.
 */
export function categoryBars(
  distribution: Extract<Distribution, { type: "categorical" }>,
  showAll: boolean
): Bar[] {
  const shown = showAll
    ? distribution.values
    : distribution.values.slice(0, TOP_CATEGORIES);
  const bars: Bar[] = shown.map((count) => ({
    label: count.value,
    a: count.a,
    b: count.b
  }));

  const otherA = distribution.totalA - shown.reduce((sum, c) => sum + c.a, 0);
  const otherB = distribution.totalB - shown.reduce((sum, c) => sum + c.b, 0);
  const collapsed = distribution.distinct - shown.length;
  if (collapsed > 0 && otherA + otherB > 0) {
    bars.push({ label: "Other", a: otherA, b: otherB, collapsed });
  }
  return bars;
}

/** A bin's range, read as a duration when the attribute is one. */
function binLabel(edges: number[], index: number, duration: boolean): string {
  const format = (value: number) =>
    duration ? formatDuration(value) : formatDecimal(value, edgeDigits(edges));
  return `${format(edges[index])}–${format(edges[index + 1])}`;
}

/**
 * Enough decimals to tell adjacent edges apart. A cost binned in tenths reads
 * as "1.2–1.3", not as "1–1" repeated ten times.
 */
function edgeDigits(edges: number[]): number {
  const width = edges[1] - edges[0];
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(width)) + 1));
}

export function binBars(
  distribution: Extract<Distribution, { type: "numerical" }>,
  attribute: string
): Bar[] {
  const duration = isDurationAttribute(attribute);
  return distribution.countsA.map((a, index) => ({
    label: binLabel(distribution.edges, index, duration),
    a,
    b: distribution.countsB[index]
  }));
}

/** The bars a card draws, whatever kind of Distribution it holds. */
export function bars(
  distribution: Distribution,
  attribute: string,
  showAll: boolean
): Bar[] {
  if (distribution.type === "categorical") return categoryBars(distribution, showAll);
  if (distribution.type === "numerical") return binBars(distribution, attribute);
  return [];
}

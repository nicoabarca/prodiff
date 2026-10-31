/**
 * What a node or an edge prints on its face, and how thick an edge is drawn.
 * Everything here reads figures already in hand, so changing a measure never
 * touches the backend and never moves a box.
 */
import { formatDuration, formatNumber } from "$lib/format";
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { AttributeBlock } from "$lib/analysis/types";
import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
import type { FaceGroup, Measure, NodeKind } from "$lib/dfg/types";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";
import { effectStep } from "$lib/tree/utils/effect";
import type { EdgeWait } from "$lib/tree/utils/flow";

/** The thinnest and thickest an edge is ever drawn, in SVG user units. */
export const EDGE_WIDTH_MIN = 1.5;
export const EDGE_WIDTH_MAX = 8;

/**
 * One entry per Group, in the order they are compared, so each can be printed
 * in its own colour. `null` where that Group never reached here.
 */
export function faceCounts(
  counts: Record<string, Counts>,
  groups: FaceGroup[],
  measure: Measure
): Record<string, string | null> {
  return Object.fromEntries(
    groups.map((group) => {
      const value = counts[group.id]?.[measure] ?? 0;
      return [group.id, value === 0 ? null : formatNumber(value)];
    })
  );
}

/**
 * The figure a node's shade is drawn from: its union across the Groups in the
 * measure shown. `null` for Start and End, and where nothing reached it.
 */
export function shadeValue(
  node: { kind: NodeKind; counts: Record<string, Counts> },
  measure: Measure
): number | null {
  if (node.kind !== "activity") return null;
  const total = unionCount(node.counts, measure);
  return total === 0 ? null : total;
}

/** Edge thickness, between 1.5 and 8, scaled against the busiest edge drawn. */
export function edgeWidth(
  counts: Record<string, Counts>,
  busiest: number,
  measure: Measure
): number {
  if (busiest <= 0) return EDGE_WIDTH_MIN;
  return (
    EDGE_WIDTH_MIN + (unionCount(counts, measure) / busiest) * (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN)
  );
}

/**
 * The Group a node belongs to, which is the one that colours it: the single
 * Group whose cases reach it, or `null` where more than one does and the node
 * is shared.
 */
export function membership(counts: Record<string, Counts>, groups: FaceGroup[]): string | null {
  const reached = groups.filter((group) => (counts[group.id]?.cases ?? 0) > 0);
  return reached.length === 1 ? reached[0].id : null;
}

/** How much of `--effect-3` an edge takes over `--effect-2` at each effect step, negligible to large. */
const EFFECT_SHARE = { 1: 45, 2: 65, 3: 85, 4: 100 };

/**
 * The colour an edge is stroked in, as a CSS colour. An edge one compared
 * Group alone follows takes that Group's colour. An edge where any test differs
 * significantly is red, stronger with its strongest effect, whichever Group is
 * higher. `null` for the default grey.
 */
export function edgeStroke(
  counts: Record<string, Counts>,
  blocks: AttributeBlock[],
  groups: FaceGroup[]
): string | null {
  if (groups.length > 1) {
    const owner = groups.find((group) => group.id === membership(counts, groups));
    if (owner) return `var(--${owner.color})`;
  }
  const effects = blocks.flatMap((block) =>
    block.test?.significant ? [block.test.effectSize] : []
  );
  if (effects.length === 0) return null;
  const share = EFFECT_SHARE[effectStep(Math.max(...effects))];
  return `color-mix(in oklab, var(--effect-3) ${share}%, var(--effect-2))`;
}

/** Every attribute block measured on each pair, by `source->target`. */
export function edgeBlocks(graph: ResponseDfg): Map<string, AttributeBlock[]> {
  return new Map(
    graph.transitions.map((transition) => [
      edgeId(transition.source, transition.target),
      Object.values(transition.attributes)
    ])
  );
}

/**
 * The waits Rust measured, by `source->target`. Only pairs the log holds have
 * one, and only when Transition Time was among the attributes asked for, so a
 * pair that only exists because an activity is hidden is absent by design.
 */
export function transitionsById(graph: ResponseDfg): Map<string, AttributeBlock> {
  return new Map(
    graph.transitions.flatMap((transition) => {
      const wait = transition.attributes[TRANSITION_TIME];
      return wait ? [[edgeId(transition.source, transition.target), wait] as const] : [];
    })
  );
}

/** Under this many milliseconds `formatDuration` rounds a wait to 0s. */
const SUB_SECOND_MS = 500;

/** A mean wait as its edge prints it. A wait too short to round to a second prints in ms. */
function waitLabel(mean: number): string {
  if (mean <= 0 || mean >= SUB_SECOND_MS) return formatDuration(mean);
  return `${Math.max(1, Math.round(mean))}ms`;
}

/**
 * The mean wait on an edge, one line per Group, in the order compared. Empty
 * when no Group waited at all: the canvas leaves that edge unlabelled.
 */
export function edgeWait(wait: AttributeBlock | undefined, groups: FaceGroup[]): EdgeWait[] {
  if (!wait) return [];
  const means = groups.flatMap((group) => {
    const summary = wait.summaries[group.id];
    return summary?.type === "numerical" ? [{ group, mean: summary.mean }] : [];
  });
  if (means.every(({ mean }) => mean <= 0)) return [];
  return means.map(({ group, mean }) => ({
    id: group.id,
    color: group.color,
    value: waitLabel(mean)
  }));
}

/** The busiest of a set, for scaling every other one against. */
export function busiest(of: { counts: Record<string, Counts> }[], measure: Measure): number {
  return of.reduce((top, one) => Math.max(top, unionCount(one.counts, measure)), 0);
}

/**
 * One Group's counts divided by how many cases that Group holds: the share of
 * its cases for `cases`, events per case for `events`. What a split panel
 * shades and thickens by, so a Group ten times larger does not draw ten times
 * thicker.
 */
export function perCase(
  counts: Record<string, Counts>,
  id: string,
  caseCounts: Map<string, number>
): Counts {
  const n = Math.max(caseCounts.get(id) ?? 0, 1);
  const own = counts[id];
  return own ? { cases: own.cases / n, events: own.events / n } : { cases: 0, events: 0 };
}

/** The busiest of a set per case of each Group, across every Group, so all split panels share it. */
export function busiestPerCase(
  of: { counts: Record<string, Counts> }[],
  caseCounts: Map<string, number>,
  measure: Measure
): number {
  return of.reduce(
    (top, one) =>
      Math.max(
        top,
        ...[...caseCounts.keys()].map((id) => perCase(one.counts, id, caseCounts)[measure])
      ),
    0
  );
}

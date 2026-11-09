/**
 * What a node or an edge prints on its face, and how thick an edge is drawn.
 * Everything here reads figures already in hand, so changing a measure never
 * touches the backend and never moves a box.
 */
import { formatDuration, formatNumber } from "$lib/format";
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { AttributeBlock } from "$lib/analysis/types";
import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
import type { EdgeLabel, FaceGroup, Measure, NodeKind } from "$lib/dfg/types";
import type { Finding } from "$lib/dfg/utils/findings";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";
import type { Statistic } from "$lib/tree/types";
import { effectStep } from "$lib/tree/utils/effect";
import type { EdgeWait } from "$lib/tree/utils/flow";

/** The thinnest and thickest an edge is ever drawn, in SVG user units. */
export const EDGE_WIDTH_MIN = 1.5;
export const EDGE_WIDTH_MAX = 8;

/** How thick every edge is drawn under a uniform width, in SVG user units. */
export const EDGE_WIDTH_UNIFORM = 2;

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

/**
 * The stroke at each effect step, negligible to large. `--effect-1` and
 * `--effect-2` are fills, paler than the grey edge on a light canvas and darker
 * on a dark one, so the two lower steps tint the grey edge with `--effect-3`.
 */
const EFFECT_STROKE = {
  1: "color-mix(in oklab, var(--effect-3) 40%, var(--muted-foreground))",
  2: "color-mix(in oklab, var(--effect-3) 70%, var(--muted-foreground))",
  3: "var(--effect-3)",
  4: "var(--effect-4)"
};

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
  return EFFECT_STROKE[effectStep(Math.max(...effects))];
}

/**
 * The tested blocks of the edges drawn, by `source->target`, as `graphFindings`
 * corrected them: those of `attribute` only, or every one for `null`.
 */
export function edgeBlocks(
  findings: Finding[],
  attribute: string | null
): Map<string, AttributeBlock[]> {
  const out = new Map<string, AttributeBlock[]>();
  for (const { place, block, attribute: tested } of findings) {
    if (place.kind !== "edge" || (attribute !== null && tested !== attribute)) continue;
    const id = edgeId(place.source, place.target);
    out.set(id, [...(out.get(id) ?? []), block]);
  }
  return out;
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

/** A duration as a face prints it. One too short to round to a second prints in ms. */
export function durationLabel(ms: number): string {
  if (ms <= 0 || ms >= SUB_SECOND_MS) return formatDuration(ms);
  return `${Math.max(1, Math.round(ms))}ms`;
}

/**
 * The wait on an edge in `statistic`, one line per Group, in the order
 * compared. Empty when no Group waited at all: the canvas leaves that edge
 * unlabelled.
 */
export function edgeWait(
  wait: AttributeBlock | undefined,
  groups: FaceGroup[],
  statistic: Statistic
): EdgeWait[] {
  if (!wait) return [];
  const values = groups.flatMap((group) => {
    const summary = wait.summaries[group.id];
    return summary?.type === "numerical" ? [{ group, value: summary[statistic] }] : [];
  });
  if (values.every(({ value }) => value <= 0)) return [];
  return values.map(({ group, value }) => ({
    id: group.id,
    color: group.color,
    value: durationLabel(value)
  }));
}

/**
 * How many cases follow an edge, one line per Group that does, in the order
 * compared. Cases, as Edge Frequency is tested in.
 */
export function edgeFrequency(counts: Record<string, Counts>, groups: FaceGroup[]): EdgeWait[] {
  return groups.flatMap((group) => {
    const value = counts[group.id]?.cases ?? 0;
    return value === 0 ? [] : [{ id: group.id, color: group.color, value: formatNumber(value) }];
  });
}

/**
 * The share of the cases reaching an edge's source that follow it, one line
 * per Group that does, in the order compared. The share Edge Frequency tests.
 */
export function edgeShare(
  counts: Record<string, Counts>,
  source: Record<string, Counts>,
  groups: FaceGroup[]
): EdgeWait[] {
  return groups.flatMap((group) => {
    const followed = counts[group.id]?.cases ?? 0;
    const reached = source[group.id]?.cases ?? 0;
    if (followed === 0 || reached === 0) return [];
    return [
      { id: group.id, color: group.color, value: `${((followed / reached) * 100).toFixed(1)}%` }
    ];
  });
}

/** The lines an edge prints beside it under `label`. Empty draws no label. */
export function edgeLines(
  label: EdgeLabel,
  counts: Record<string, Counts>,
  source: Record<string, Counts>,
  wait: AttributeBlock | undefined,
  groups: FaceGroup[],
  statistic: Statistic
): EdgeWait[] {
  if (label === "frequency") return edgeFrequency(counts, groups);
  if (label === "share") return edgeShare(counts, source, groups);
  if (label === "waiting") return edgeWait(wait, groups, statistic);
  return [];
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

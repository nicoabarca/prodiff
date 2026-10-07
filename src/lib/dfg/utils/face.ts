/**
 * What a node or an edge prints on its face, and how thick an edge is drawn.
 * Everything here reads figures already in hand, so changing a measure never
 * touches the backend and never moves a box.
 */
import { formatDuration } from "$lib/format";
import type { AttributeBlock } from "$lib/analysis/types";
import type { Counts, DfgNode, ResponseDfg } from "$lib/dfg/invokers/types";
import type {
  EdgeMeasure,
  FaceGroup,
  Frequency,
  Measure,
  NodeKind,
  WaitLabel
} from "$lib/dfg/types";
import { edgeId, unionCount } from "$lib/dfg/utils/fold";
import { formatMeasure, measureUnion, measureValue, type Measurable } from "$lib/dfg/utils/measure";
import { pooledMean } from "$lib/groups/utils/shade";

/** The thinnest and thickest an edge is ever drawn, in SVG user units. */
export const EDGE_WIDTH_MIN = 1.5;
export const EDGE_WIDTH_MAX = 8;

/**
 * One entry per Group, in the order they are compared, so each can be printed
 * in its own colour. `null` where that Group has no figure here.
 */
export function faceFigures(
  node: Measurable,
  groups: FaceGroup[],
  measure: Measure
): Record<string, string | null> {
  return Object.fromEntries(
    groups.map((group) => [group.id, formatMeasure(measureValue(node, group.id, measure), measure)])
  );
}

/**
 * The figure a node's shade is drawn from, in the measure shown. `null` for
 * Start and End, and where the measure has nothing to say about the node.
 */
export function shadeValue(node: Measurable & { kind: NodeKind }, measure: Measure): number | null {
  if (node.kind !== "activity") return null;
  return measureUnion(node, measure);
}

/** The mean wait over every case that ran a pair, `null` where none was measured. */
export function waitMean(wait: AttributeBlock | undefined): number | null {
  if (!wait) return null;
  return pooledMean(
    Object.values(wait.summaries).flatMap((summary) =>
      summary.type === "numerical" ? [{ mean: summary.mean, n: summary.n }] : []
    )
  );
}

/**
 * The figure an edge's width is drawn from. A pair with no wait measured sits
 * at zero rather than falling back to its frequency, so one canvas never mixes
 * the two units.
 */
export function edgeValue(
  counts: Record<string, Counts>,
  wait: AttributeBlock | undefined,
  edge: EdgeMeasure,
  frequency: Frequency
): number {
  return edge === "wait" ? (waitMean(wait) ?? 0) : unionCount(counts, frequency);
}

/** Edge thickness, between 1.5 and 8, scaled against the largest figure drawn. */
export function edgeWidth(value: number, largest: number): number {
  if (largest <= 0) return EDGE_WIDTH_MIN;
  return EDGE_WIDTH_MIN + (value / largest) * (EDGE_WIDTH_MAX - EDGE_WIDTH_MIN);
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
 * The waits Rust measured, by `source->target`. Only pairs the log holds have
 * one, and only when Transition Time was among the attributes asked for, so a
 * pair that only exists because an activity is hidden is absent by design.
 */
export function transitionsById(graph: ResponseDfg): Map<string, AttributeBlock> {
  return new Map(
    graph.transitions.map((transition) => [
      edgeId(transition.source, transition.target),
      transition.wait
    ])
  );
}

/** The mean wait on an edge, one part per Group that measured one. */
export function edgeWait(wait: AttributeBlock | undefined, groups: FaceGroup[]): WaitLabel | null {
  if (!wait) return null;
  const parts = groups.flatMap((group) => {
    const summary = wait.summaries[group.id];
    return summary?.type === "numerical"
      ? [{ id: group.id, color: group.color, text: formatDuration(summary.mean) }]
      : [];
  });
  if (parts.length === 0) return null;
  return { parts, shared: parts.every((part) => part.text === parts[0].text) };
}

/** A label as one line of text, for measuring how much room it needs. */
export function waitText(label: WaitLabel): string {
  return label.shared ? label.parts[0].text : label.parts.map((part) => part.text).join(" · ");
}

/** A Group's dot and the gap before it, in SVG user units. */
const DOT_WIDTH = 10;
/** The separator between two Groups' figures, in SVG user units. */
const SEPARATOR_WIDTH = 8;

/**
 * The room a label needs beyond its text: every Group's dot is drawn, and a
 * separator stands between two figures that differ. Placing a label without
 * this counts the pill as narrower than it is and lets two overlap.
 */
export function waitExtra(label: WaitLabel): number {
  const separators = label.shared ? 0 : label.parts.length - 1;
  return label.parts.length * DOT_WIDTH + separators * SEPARATOR_WIDTH;
}

/** How many of a node's attributes came back a significant difference. */
export function findings(node: DfgNode | undefined): number {
  if (!node) return 0;
  return Object.values(node.attributes).filter((block) => block.test?.significant).length;
}

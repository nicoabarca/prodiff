/**
 * What the Display panel offers and what it draws, read from the graph already
 * in hand. A duration the build did not measure is never drawn, whatever the
 * view names, and an edge is coloured by the test of the figure it prints.
 */
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import {
  EDGE_FREQUENCY,
  type DfgView,
  type EdgeLabel,
  type EdgeWidth,
  type Measure
} from "$lib/dfg/types";

/** Which of the attributes edges are tested in the build measured. */
export interface Built {
  waiting: boolean;
  edgeFrequency: boolean;
}

export function builtAttributes(graph: ResponseDfg | null): Built {
  const onEdges = (name: string) =>
    graph?.transitions.some((transition) => transition.attributes[name]) ?? false;
  return { waiting: onEdges(TRANSITION_TIME), edgeFrequency: onEdges(EDGE_FREQUENCY) };
}

/**
 * The attribute whose test colours an edge under `label`: Transition Time for
 * Waiting time, Edge Frequency for Frequency and Share, `null` for every test
 * on it.
 */
export function paintedAttribute(label: EdgeLabel): string | null {
  if (label === "waiting") return TRANSITION_TIME;
  if (label === "frequency" || label === "share") return EDGE_FREQUENCY;
  return null;
}

/** The label an edge prints: Waiting Time falls back to none when it was not built. */
export function shownEdgeLabel(label: EdgeLabel, built: Built): EdgeLabel {
  return label === "waiting" && !built.waiting ? "off" : label;
}

/** What the Display field reads after the figure, for example "mean wait on edges". */
export function edgeCaption(view: Pick<DfgView, "edgeLabel" | "statistic">, built: Built): string {
  const label = shownEdgeLabel(view.edgeLabel, built);
  if (label === "waiting") return `${view.statistic} wait on edges`;
  if (label === "frequency") return "cases on edges";
  if (label === "share") return "% followed on edges";
  return "no edge labels";
}

/** What the tests panel says the canvas draws: what a red edge differs in, and what the weights carry. */
export function canvasLegend(
  label: EdgeLabel,
  built: Built,
  measure: Measure,
  width: EdgeWidth
): string {
  const shown = shownEdgeLabel(label, built);
  const byFrequency = shown === "frequency" || shown === "share";
  const untested = byFrequency && !built.edgeFrequency;
  const red = untested
    ? "Edges stay grey: build with Edge Frequency to test how often each is followed."
    : shown === "waiting"
      ? "A red edge differs significantly in Waiting Time, redder when larger. It does not say which group is higher."
      : byFrequency
        ? "A red edge differs significantly in how often it is followed, redder when larger. It does not say which group is higher."
        : "A red edge differs significantly in at least one test, redder when larger. It does not say which group is higher.";
  const weight =
    width === "uniform"
      ? `Darker activities carry more ${measure}.`
      : `Thicker edges and darker activities carry more ${measure}.`;
  return `${red} ${weight}`;
}

/**
 * What the Display panel offers and what it draws, read from the graph already
 * in hand. A duration the build did not measure is never drawn, whatever the
 * view names, and an edge is coloured by the test of the figure it prints.
 */
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import {
  EDGE_FREQUENCY,
  type DfgView,
  type EdgeLabel,
  type EdgeWidth,
  type Measure,
  type NodeFigure
} from "$lib/dfg/types";

/**
 * Which of the attributes the Display panel reads the build measured: Service
 * Time on activities, Waiting Time and Edge Frequency on edges.
 */
export interface Built {
  serviceTime: boolean;
  waiting: boolean;
  edgeFrequency: boolean;
}

export function builtAttributes(graph: ResponseDfg | null): Built {
  const onEdges = (name: string) =>
    graph?.transitions.some((transition) => transition.attributes[name]) ?? false;
  return {
    serviceTime: graph?.nodes.some((node) => node.attributes[ACTIVITY_DURATION]) ?? false,
    waiting: onEdges(TRANSITION_TIME),
    edgeFrequency: onEdges(EDGE_FREQUENCY)
  };
}

/**
 * The attribute whose test colours an edge under `label`: Transition Time for
 * Waiting time, Edge Frequency for Frequency, `null` for every test on it.
 */
export function paintedAttribute(label: EdgeLabel): string | null {
  if (label === "waiting") return TRANSITION_TIME;
  if (label === "frequency") return EDGE_FREQUENCY;
  return null;
}

/** The figure a node prints: Service Time falls back to cases when it was not built. */
export function shownFigure(figure: NodeFigure, built: Built): NodeFigure {
  return figure === "serviceTime" && !built.serviceTime ? "cases" : figure;
}

/** The label an edge prints: Waiting Time falls back to none when it was not built. */
export function shownEdgeLabel(label: EdgeLabel, built: Built): EdgeLabel {
  return label === "waiting" && !built.waiting ? "off" : label;
}

/**
 * What the Display field reads, the figure then the edges, for example
 * "Cases" and "mean wait on edges".
 */
export function displayCaption(view: DfgView, built: Built): { figure: string; edges: string } {
  const figure = shownFigure(view.figure, built);
  const label = shownEdgeLabel(view.edgeLabel, built);
  return {
    figure:
      figure === "serviceTime"
        ? `${view.statistic === "median" ? "Median" : "Mean"} service time`
        : figure === "events"
          ? "Events"
          : "Cases",
    edges:
      label === "waiting"
        ? `${view.statistic} wait on edges`
        : label === "frequency"
          ? "cases on edges"
          : "no edge labels"
  };
}

/** What the tests panel says the canvas draws: what a red edge differs in, and what the weights carry. */
export function canvasLegend(
  label: EdgeLabel,
  built: Built,
  measure: Measure,
  width: EdgeWidth
): string {
  const shown = shownEdgeLabel(label, built);
  const untested = shown === "frequency" && !built.edgeFrequency;
  const red = untested
    ? "Edges stay grey: build with Edge Frequency to test how often each is followed."
    : shown === "waiting"
      ? "A red edge differs significantly in Waiting Time, redder when larger. It does not say which group is higher."
      : shown === "frequency"
        ? "A red edge differs significantly in how often it is followed, redder when larger. It does not say which group is higher."
        : "A red edge differs significantly in at least one test, redder when larger. It does not say which group is higher.";
  const weight =
    width === "uniform"
      ? `Darker activities carry more ${measure}.`
      : `Thicker edges and darker activities carry more ${measure}.`;
  return `${red} ${weight}`;
}

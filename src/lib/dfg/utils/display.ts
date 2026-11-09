/**
 * What the Display panel offers and what it draws, read from the graph already
 * in hand. A duration the build did not measure is never drawn, whatever the
 * view names.
 */
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import type { DfgView, EdgeLabel, NodeFigure } from "$lib/dfg/types";

/** Which durations the build measured: Service Time on activities, Waiting Time on edges. */
export interface Built {
  serviceTime: boolean;
  waiting: boolean;
}

export function builtDurations(graph: ResponseDfg | null): Built {
  return {
    serviceTime: graph?.nodes.some((node) => node.attributes[ACTIVITY_DURATION]) ?? false,
    waiting:
      graph?.transitions.some((transition) => transition.attributes[TRANSITION_TIME]) ?? false
  };
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
          ? `${view.measure} on edges`
          : "no edge labels"
  };
}

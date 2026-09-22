/** Dev-only tuning for the Graphviz layout spike. */

export type Splines = "spline" | "polyline" | "ortho" | "curved" | "line";
export type EdgeLabels = "label" | "xlabel" | "none";
export type EdgeWeight = "count" | "log" | "flat";
export type Ordering = "none" | "out" | "in";

/**
 * The `dot` attributes the tuning panel exposes. `nodesep` and `ranksep` are in
 * pixels. Edges whose count falls below `looseBelow` times the busiest edge's
 * count get `constraint=false`, so they stop pulling ranks around.
 */
export interface GraphvizTuning {
  splines: Splines;
  nodesep: number;
  ranksep: number;
  concentrate: boolean;
  newrank: boolean;
  remincross: boolean;
  pinTerminals: boolean;
  mclimit: number;
  searchsize: number;
  ordering: Ordering;
  edgeLabels: EdgeLabels;
  weight: EdgeWeight;
  looseBelow: number;
}

/** One tuning for graphs under the spaghetti threshold, one for those over it. */
export interface GraphvizTunings {
  compact: GraphvizTuning;
  spaghetti: GraphvizTuning;
}

export const defaultGraphvizTunings: GraphvizTunings = {
  compact: {
    splines: "spline",
    nodesep: 90,
    ranksep: 80,
    concentrate: false,
    newrank: false,
    remincross: false,
    pinTerminals: true,
    mclimit: 1,
    searchsize: 30,
    ordering: "none",
    edgeLabels: "label",
    weight: "count",
    looseBelow: 0
  },
  spaghetti: {
    splines: "spline",
    nodesep: 60,
    ranksep: 60,
    concentrate: false,
    newrank: true,
    remincross: true,
    pinTerminals: true,
    mclimit: 4,
    searchsize: 30,
    ordering: "none",
    edgeLabels: "xlabel",
    weight: "log",
    looseBelow: 0.02
  }
};

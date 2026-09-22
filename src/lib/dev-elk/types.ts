/** Dev-only tuning for the ELK layered layout. */

export const EDGE_ROUTINGS = ["SPLINES", "POLYLINE", "ORTHOGONAL"] as const;
export const CROSSING_MINIMIZATIONS = ["LAYER_SWEEP", "INTERACTIVE", "NONE"] as const;
export const NODE_PLACEMENTS = [
  "NETWORK_SIMPLEX",
  "BRANDES_KOEPF",
  "LINEAR_SEGMENTS",
  "SIMPLE"
] as const;
export const LAYERINGS = [
  "NETWORK_SIMPLEX",
  "LONGEST_PATH",
  "LONGEST_PATH_SOURCE",
  "COFFMAN_GRAHAM",
  "STRETCH_WIDTH",
  "MIN_WIDTH",
  "BF_MODEL_ORDER",
  "DF_MODEL_ORDER"
] as const;
export const CYCLE_BREAKINGS = [
  "GREEDY",
  "DEPTH_FIRST",
  "MODEL_ORDER",
  "GREEDY_MODEL_ORDER"
] as const;
export const MODEL_ORDERS = ["NONE", "NODES_AND_EDGES", "PREFER_EDGES", "PREFER_NODES"] as const;

/** Spacings are in pixels. `thoroughness` is ELK's crossing-reduction effort. */
export interface ElkTuning {
  edgeRouting: (typeof EDGE_ROUTINGS)[number];
  nodeNodeBetweenLayers: number;
  edgeNodeBetweenLayers: number;
  edgeEdgeBetweenLayers: number;
  nodeNode: number;
  edgeNode: number;
  edgeEdge: number;
  crossingMinimization: (typeof CROSSING_MINIMIZATIONS)[number];
  nodePlacement: (typeof NODE_PLACEMENTS)[number];
  layering: (typeof LAYERINGS)[number];
  cycleBreaking: (typeof CYCLE_BREAKINGS)[number];
  considerModelOrder: (typeof MODEL_ORDERS)[number];
  thoroughness: number;
  favorStraightEdges: boolean;
  mergeEdges: boolean;
  separateConnectedComponents: boolean;
}

/** One tuning for graphs under the spaghetti threshold, one for those over it. */
export interface ElkTunings {
  compact: ElkTuning;
  spaghetti: ElkTuning;
}

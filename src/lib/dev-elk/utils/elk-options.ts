import type { ElkTuning, ElkTunings } from "$lib/dev-elk/types";
import { COMPACT, SPAGHETTI, type SpacingTier } from "$lib/dfg/utils/layout";

function fromTier(tier: SpacingTier): ElkTuning {
  return {
    ...tier,
    edgeNodeBetweenLayers: 10,
    edgeEdgeBetweenLayers: 10,
    crossingMinimization: "LAYER_SWEEP",
    nodePlacement: "NETWORK_SIMPLEX",
    layering: "NETWORK_SIMPLEX",
    cycleBreaking: "GREEDY",
    considerModelOrder: "NODES_AND_EDGES",
    thoroughness: 7,
    favorStraightEdges: false,
    mergeEdges: false,
    separateConnectedComponents: true
  };
}

/** Starts from the spacing ELK lays out with today, plus ELK's own defaults. */
export const defaultElkTunings: ElkTunings = {
  compact: fromTier(COMPACT),
  spaghetti: fromTier(SPAGHETTI)
};

export function elkOptions(tuning: ElkTuning): Record<string, string> {
  return {
    "elk.edgeRouting": tuning.edgeRouting,
    "elk.layered.spacing.nodeNodeBetweenLayers": String(tuning.nodeNodeBetweenLayers),
    "elk.layered.spacing.edgeNodeBetweenLayers": String(tuning.edgeNodeBetweenLayers),
    "elk.layered.spacing.edgeEdgeBetweenLayers": String(tuning.edgeEdgeBetweenLayers),
    "elk.spacing.nodeNode": String(tuning.nodeNode),
    "elk.spacing.edgeNode": String(tuning.edgeNode),
    "elk.spacing.edgeEdge": String(tuning.edgeEdge),
    "elk.layered.crossingMinimization.strategy": tuning.crossingMinimization,
    "elk.layered.nodePlacement.strategy": tuning.nodePlacement,
    "elk.layered.layering.strategy": tuning.layering,
    "elk.layered.cycleBreaking.strategy": tuning.cycleBreaking,
    "elk.layered.considerModelOrder.strategy": tuning.considerModelOrder,
    "elk.layered.thoroughness": String(tuning.thoroughness),
    "elk.layered.nodePlacement.favorStraightEdges": String(tuning.favorStraightEdges),
    "elk.layered.mergeEdges": String(tuning.mergeEdges),
    "elk.separateConnectedComponents": String(tuning.separateConnectedComponents)
  };
}

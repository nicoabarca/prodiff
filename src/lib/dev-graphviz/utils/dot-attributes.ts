import type { EdgeWeight, GraphvizTuning } from "$lib/dev-graphviz/types";
import { inches, type DotAttributes } from "$lib/dfg/utils/layout-graphviz";
import { formatNumber } from "$lib/format";

function edgeWeight(count: number, mode: EdgeWeight): number {
  if (mode === "flat") return 1;
  if (mode === "log") return Math.max(1, Math.round(Math.log2(count + 1)));
  return Math.max(1, Math.round(count));
}

export function dotAttributes(tuning: GraphvizTuning): DotAttributes {
  const graph: Record<string, string> = {
    splines: tuning.splines,
    nodesep: inches(tuning.nodesep),
    ranksep: inches(tuning.ranksep),
    mclimit: String(tuning.mclimit),
    searchsize: String(tuning.searchsize)
  };
  if (tuning.concentrate) graph.concentrate = "true";
  if (tuning.newrank) graph.newrank = "true";
  if (tuning.remincross) graph.remincross = "true";
  if (tuning.ordering !== "none") graph.ordering = tuning.ordering;

  return {
    graph,
    pinTerminals: tuning.pinTerminals,
    edge: (count, busiest) => {
      const attributes: Record<string, string> = {
        weight: String(edgeWeight(count, tuning.weight))
      };
      if (tuning.edgeLabels !== "none" && count > 0)
        attributes[tuning.edgeLabels] = formatNumber(count);
      if (count / busiest < tuning.looseBelow) attributes.constraint = "false";
      return attributes;
    }
  };
}

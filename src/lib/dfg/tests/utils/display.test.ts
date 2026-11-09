import { describe, expect, it } from "vitest";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { defaultDfgView } from "$lib/dfg/types";
import {
  builtDurations,
  displayCaption,
  shownEdgeLabel,
  shownFigure
} from "$lib/dfg/utils/display";

const block = { summaries: {}, test: null, method: null };
const both = { serviceTime: true, waiting: true };
const neither = { serviceTime: false, waiting: false };

describe("builtDurations", () => {
  it("reads which durations the build measured", () => {
    const graph = {
      nodes: [
        { id: 2, label: "a", counts: {}, attributes: { [ACTIVITY_DURATION]: block }, values: {} }
      ],
      variants: [],
      transitions: [{ source: 0, target: 2, attributes: {} }],
      groups: [],
      caseLevel: {}
    } satisfies ResponseDfg;
    expect(builtDurations(graph)).toEqual({ serviceTime: true, waiting: false });
    graph.transitions[0].attributes = { [TRANSITION_TIME]: block };
    expect(builtDurations(graph).waiting).toBe(true);
    expect(builtDurations(null)).toEqual(neither);
  });
});

describe("shownFigure and shownEdgeLabel", () => {
  it("draw a duration only when it was built", () => {
    expect(shownFigure("serviceTime", both)).toBe("serviceTime");
    expect(shownFigure("serviceTime", neither)).toBe("cases");
    expect(shownFigure("events", neither)).toBe("events");
    expect(shownEdgeLabel("waiting", both)).toBe("waiting");
    expect(shownEdgeLabel("waiting", neither)).toBe("off");
    expect(shownEdgeLabel("frequency", neither)).toBe("frequency");
  });
});

describe("displayCaption", () => {
  it("opens on cases and the mean wait when Waiting Time was built", () => {
    expect(displayCaption(defaultDfgView, both)).toEqual({
      figure: "Cases",
      edges: "mean wait on edges"
    });
  });

  it("says no edge labels when Waiting Time was not built", () => {
    expect(displayCaption(defaultDfgView, neither).edges).toBe("no edge labels");
  });

  it("names the statistic and the count", () => {
    const view = {
      ...defaultDfgView,
      figure: "serviceTime" as const,
      edgeLabel: "frequency" as const,
      measure: "events" as const,
      statistic: "median" as const
    };
    expect(displayCaption(view, both)).toEqual({
      figure: "Median service time",
      edges: "events on edges"
    });
  });
});

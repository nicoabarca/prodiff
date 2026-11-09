import { describe, expect, it } from "vitest";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { EDGE_FREQUENCY, defaultDfgView } from "$lib/dfg/types";
import {
  builtAttributes,
  canvasLegend,
  displayCaption,
  paintedAttribute,
  shownEdgeLabel,
  shownFigure
} from "$lib/dfg/utils/display";

const block = { summaries: {}, test: null, method: null };
const both = { serviceTime: true, waiting: true, edgeFrequency: true };
const neither = { serviceTime: false, waiting: false, edgeFrequency: false };

describe("builtAttributes", () => {
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
    expect(builtAttributes(graph)).toEqual({
      serviceTime: true,
      waiting: false,
      edgeFrequency: false
    });
    graph.transitions[0].attributes = { [TRANSITION_TIME]: block, [EDGE_FREQUENCY]: block };
    expect(builtAttributes(graph)).toMatchObject({ waiting: true, edgeFrequency: true });
    expect(builtAttributes(null)).toEqual(neither);
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

  it("names the statistic, and counts cases for Frequency whatever the count", () => {
    const view = {
      ...defaultDfgView,
      figure: "serviceTime" as const,
      edgeLabel: "frequency" as const,
      measure: "events" as const,
      statistic: "median" as const
    };
    expect(displayCaption(view, both)).toEqual({
      figure: "Median service time",
      edges: "cases on edges"
    });
  });
});

describe("paintedAttribute", () => {
  it("colours an edge by the test of the figure it prints, or by any test when it prints none", () => {
    expect(paintedAttribute("waiting")).toBe(TRANSITION_TIME);
    expect(paintedAttribute("frequency")).toBe(EDGE_FREQUENCY);
    expect(paintedAttribute("off")).toBeNull();
  });
});

describe("canvasLegend", () => {
  it("names what a red edge differs in", () => {
    expect(canvasLegend("waiting", both, "cases", "scaled")).toContain("in Waiting Time");
    expect(canvasLegend("frequency", both, "cases", "scaled")).toContain(
      "how often it is followed"
    );
    expect(canvasLegend("off", both, "cases", "scaled")).toContain("at least one test");
  });

  it("names a label that falls back as the one drawn", () => {
    expect(canvasLegend("waiting", neither, "cases", "scaled")).toContain("at least one test");
  });

  it("says edges stay grey under Frequency when Edge Frequency was not built", () => {
    expect(canvasLegend("frequency", neither, "cases", "scaled")).toMatch(/^Edges stay grey/);
  });

  it("names the count the weights carry", () => {
    expect(canvasLegend("off", both, "events", "scaled")).toContain(
      "Thicker edges and darker activities carry more events."
    );
    expect(canvasLegend("off", both, "cases", "uniform")).toContain(
      "Darker activities carry more cases."
    );
  });
});

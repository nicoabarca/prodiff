import { describe, expect, it } from "vitest";
import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { ResponseDfg } from "$lib/dfg/invokers/types";
import { EDGE_FREQUENCY, defaultDfgView } from "$lib/dfg/types";
import {
  builtAttributes,
  canvasLegend,
  edgeCaption,
  paintedAttribute,
  shownEdgeLabel
} from "$lib/dfg/utils/display";

const block = { summaries: {}, test: null, method: null };
const both = { waiting: true, edgeFrequency: true };
const neither = { waiting: false, edgeFrequency: false };

describe("builtAttributes", () => {
  it("reads which edge attributes the build measured", () => {
    const graph = {
      nodes: [],
      variants: [],
      transitions: [{ source: 0, target: 2, attributes: {} }],
      groups: [],
      caseLevel: {}
    } satisfies ResponseDfg;
    expect(builtAttributes(graph)).toEqual(neither);
    graph.transitions[0].attributes = { [TRANSITION_TIME]: block, [EDGE_FREQUENCY]: block };
    expect(builtAttributes(graph)).toEqual(both);
    expect(builtAttributes(null)).toEqual(neither);
  });
});

describe("shownEdgeLabel", () => {
  it("draws Waiting time only when it was built", () => {
    expect(shownEdgeLabel("waiting", both)).toBe("waiting");
    expect(shownEdgeLabel("waiting", neither)).toBe("off");
    expect(shownEdgeLabel("share", neither)).toBe("share");
  });
});

describe("edgeCaption", () => {
  it("opens on the mean wait when Waiting Time was built, and on none when it was not", () => {
    expect(edgeCaption(defaultDfgView, both)).toBe("mean wait on edges");
    expect(edgeCaption(defaultDfgView, neither)).toBe("no edge labels");
  });

  it("names the statistic and the frequency shown", () => {
    expect(edgeCaption({ edgeLabel: "waiting", statistic: "median" }, both)).toBe(
      "median wait on edges"
    );
    expect(edgeCaption({ edgeLabel: "frequency", statistic: "mean" }, both)).toBe("cases on edges");
    expect(edgeCaption({ edgeLabel: "share", statistic: "mean" }, both)).toBe(
      "% followed on edges"
    );
  });
});

describe("paintedAttribute", () => {
  it("colours an edge by the test of the figure it prints, or by any test when it prints none", () => {
    expect(paintedAttribute("waiting")).toBe(TRANSITION_TIME);
    expect(paintedAttribute("frequency")).toBe(EDGE_FREQUENCY);
    expect(paintedAttribute("share")).toBe(EDGE_FREQUENCY);
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

  it("says edges stay grey under a frequency when Edge Frequency was not built", () => {
    expect(canvasLegend("frequency", neither, "cases", "scaled")).toMatch(/^Edges stay grey/);
    expect(canvasLegend("share", neither, "cases", "scaled")).toMatch(/^Edges stay grey/);
    expect(canvasLegend("share", both, "cases", "scaled")).toContain("how often it is followed");
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

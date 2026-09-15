import { afterEach, describe, expect, it } from "vitest";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { Project } from "$lib/event-log/types";
import { selectedAttributes, selection } from "$lib/dfg/state/dfg.svelte";

const project = {
  id: "p",
  columns: [
    { name: "visible", role: "other", type: "string", scope: "event" },
    { name: "hidden", role: "other", type: "string", scope: "event" },
    { name: "started", role: "start_timestamp", type: "datetime", scope: "event" }
  ],
  hiddenColumns: ["hidden"]
} as Project;

afterEach(() => {
  selection.attributes = [];
});

describe("selectedAttributes", () => {
  it("does not send hidden or stale attributes to the DFG build", () => {
    selection.attributes = [
      "visible",
      "hidden",
      "other-project",
      ACTIVITY_DURATION,
      TRANSITION_TIME
    ];

    expect(selectedAttributes(project)).toEqual(["visible", ACTIVITY_DURATION, TRANSITION_TIME]);
  });
});

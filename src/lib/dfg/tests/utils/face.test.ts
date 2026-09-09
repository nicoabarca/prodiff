import { describe, expect, it } from "vitest";
import { faceCounts } from "$lib/dfg/utils/face";

describe("faceCounts", () => {
  it("keys displayed counts by Group id", () => {
    const counts = faceCounts(
      {
        original: { cases: 4, events: 7 },
        selected: { cases: 0, events: 2 }
      },
      [
        { id: "selected", name: "Selected", color: "group-a" },
        { id: "original", name: "Original", color: "group-original" }
      ],
      "cases"
    );

    expect(counts).toEqual({ selected: null, original: "4" });
  });
});

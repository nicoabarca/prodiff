import { describe, expect, it } from "vitest";
import { faceCounts, shadeValue } from "$lib/dfg/utils/face";

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

describe("shadeValue", () => {
  const counts = {
    a: { cases: 3, events: 9 },
    b: { cases: 2, events: 4 }
  };

  it("is the union across the Groups in the measure shown", () => {
    expect(shadeValue({ kind: "activity", counts }, "cases")).toBe(5);
    expect(shadeValue({ kind: "activity", counts }, "events")).toBe(13);
  });

  it("is missing for Start and End", () => {
    expect(shadeValue({ kind: "start", counts }, "cases")).toBeNull();
    expect(shadeValue({ kind: "end", counts }, "cases")).toBeNull();
  });

  it("is missing where nothing reached the node", () => {
    expect(
      shadeValue({ kind: "activity", counts: { a: { cases: 0, events: 0 } } }, "cases")
    ).toBeNull();
  });
});

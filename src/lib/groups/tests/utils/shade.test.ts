import { describe, expect, it } from "vitest";
import { shade } from "$lib/groups/utils/shade";

describe("shade", () => {
  it("tints the fill and the border in the Group's colour", () => {
    expect(shade("group-2")).toEqual({
      fill: "color-mix(in oklab, var(--group-2) 8%, var(--card))",
      border: "color-mix(in oklab, var(--group-2) 45%, var(--card))"
    });
  });
});

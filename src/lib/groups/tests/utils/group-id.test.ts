import { describe, expect, it } from "vitest";
import { defaultColor, GROUP_COLORS } from "$lib/groups/colors";
import { groupId } from "$lib/groups/utils/group-id";

describe("groupId", () => {
  it("is eight base62 characters", () => {
    expect(groupId()).toMatch(/^[0-9A-Za-z]{8}$/);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 500 }, groupId));
    expect(ids.size).toBe(500);
  });
});

describe("defaultColor", () => {
  it("hands out the palette in order", () => {
    expect(defaultColor(0)).toBe(GROUP_COLORS[0]);
    expect(defaultColor(2)).toBe(GROUP_COLORS[2]);
  });

  it("wraps rather than running out", () => {
    expect(defaultColor(GROUP_COLORS.length)).toBe(GROUP_COLORS[0]);
  });
});

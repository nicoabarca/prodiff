import { describe, expect, it } from "vitest";
import { diffKeys } from "$lib/tree/utils/diff";

describe("diffKeys", () => {
  it("names what arrived and what left", () => {
    const diff = diffKeys(["Start", "Start/A"], ["Start", "Start/B"]);
    expect([...diff.added]).toEqual(["Start/B"]);
    expect([...diff.removed]).toEqual(["Start/A"]);
  });

  it("sees nothing in two identical builds", () => {
    const diff = diffKeys(["Start", "Start/A"], ["Start", "Start/A"]);
    expect(diff.added).toEqual(new Set());
    expect(diff.removed).toEqual(new Set());
  });

  it("reads an empty previous build as all added", () => {
    const diff = diffKeys([], ["Start"]);
    expect([...diff.added]).toEqual(["Start"]);
    expect(diff.removed.size).toBe(0);
  });

  it("takes a Set as readily as an array", () => {
    const diff = diffKeys(new Set(["Start"]), new Set(["Start", "Start/A"]));
    expect([...diff.added]).toEqual(["Start/A"]);
  });
});

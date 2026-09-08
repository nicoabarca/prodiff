import { describe, expect, it } from "vitest";
import { sameSelection } from "$lib/tree/utils/variants";

describe("sameSelection", () => {
  it("ignores order", () => {
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("sees a different size as different", () => {
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
  });

  it("sees the same size with different members as different", () => {
    expect(sameSelection(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("reads duplicates as one member", () => {
    expect(sameSelection(["a", "a"], ["a"])).toBe(true);
  });

  it("compares a Set to an array", () => {
    expect(sameSelection(new Set(["a", "b"]), ["b", "a"])).toBe(true);
  });

  it("holds for two empty selections", () => {
    expect(sameSelection([], [])).toBe(true);
  });
});

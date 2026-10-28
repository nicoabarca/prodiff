import { describe, expect, it } from "vitest";
import { treeKey } from "$lib/tree/utils/settings";
import type { TreeSettings } from "$lib/tree/types";

const settings: TreeSettings = {
  attributes: ["Region"],
  selectedVariants: ["a", "b"],
  attributesChosen: true
};

const compared = JSON.stringify([["g1", 1]]);

describe("treeKey", () => {
  it("reads two Variant orders as one tree", () => {
    expect(treeKey(compared, settings)).toBe(
      treeKey(compared, { ...settings, selectedVariants: ["b", "a"] })
    );
  });

  it("separates two attribute selections", () => {
    expect(treeKey(compared, settings)).not.toBe(
      treeKey(compared, { ...settings, attributes: [] })
    );
  });

  it("separates two comparisons", () => {
    expect(treeKey(compared, settings)).not.toBe(treeKey(JSON.stringify([["g1", 2]]), settings));
  });
});

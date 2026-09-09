import { describe, expect, it } from "vitest";
import type { Filter } from "$lib/filters/kind/filter";
import type { Group } from "$lib/groups/types";
import { treeKey } from "$lib/tree/utils/settings";
import type { TreeSettings } from "$lib/tree/types";

function filter(column: string): Filter {
  return { kind: "attribute", column, mode: "mandatory", values: ["x"] };
}

function group(id: string, filters: Filter[] = []): Group {
  return {
    id,
    projectId: "p",
    name: id,
    color: "group-1",
    position: 0,
    filters,
    stats: null,
    createdAt: "",
    editedAt: ""
  };
}

const settings: TreeSettings = {
  attributes: ["Region"],
  selectedVariants: ["a", "b"],
  attributesChosen: true
};

describe("treeKey", () => {
  it("reads two Variant orders as one tree", () => {
    expect(treeKey([group("g1")], settings)).toBe(
      treeKey([group("g1")], { ...settings, selectedVariants: ["b", "a"] })
    );
  });

  it("separates two attribute selections", () => {
    expect(treeKey([group("g1")], settings)).not.toBe(
      treeKey([group("g1")], { ...settings, attributes: [] })
    );
  });

  it("separates a Group re-applied under a different Filter List", () => {
    expect(treeKey([group("g1", [filter("a")])], settings)).not.toBe(
      treeKey([group("g1", [filter("b")])], settings)
    );
  });

  it("separates two Groups that hold the same Filter List", () => {
    expect(treeKey([group("g1", [filter("a")])], settings)).not.toBe(
      treeKey([group("g2", [filter("a")])], settings)
    );
  });

  it("keeps the order the Groups are compared in", () => {
    const first = group("g1");
    const second = group("g2");
    expect(treeKey([first, second], settings)).not.toBe(treeKey([second, first], settings));
  });
});

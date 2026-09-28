import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Group } from "$lib/groups/types";

const applied: Group[] = [];

vi.mock("$lib/groups/state/groups.svelte", () => ({
  allGroups: () => applied,
  isApplied: () => true
}));

const { pickGroup, statisticsGroups } = await import("$lib/statistics/state/selection.svelte");

const group = (id: string) => ({ id, projectId: "p" }) as Group;

describe("statisticsGroups", () => {
  beforeEach(() => {
    applied.splice(0, applied.length, group("original"), group("g1"), group("g2"));
  });

  it("opens on the Original against the first Group", () => {
    expect(statisticsGroups("fresh").map((g) => g.id)).toEqual(["original", "g1"]);
  });

  it("shows the Original alone when there is nothing to compare", () => {
    applied.splice(1);
    expect(statisticsGroups("alone").map((g) => g.id)).toEqual(["original"]);
  });

  it("swaps when a slot picks what the other holds", () => {
    pickGroup("swap", 1, "original");
    expect(statisticsGroups("swap").map((g) => g.id)).toEqual(["g1", "original"]);
  });

  it("clears the second slot and falls back from a Group that is gone", () => {
    pickGroup("gone", 0, "g2");
    pickGroup("gone", 1, null);
    expect(statisticsGroups("gone").map((g) => g.id)).toEqual(["g2"]);
    applied.splice(2);
    expect(statisticsGroups("gone").map((g) => g.id)).toEqual(["original"]);
  });
});

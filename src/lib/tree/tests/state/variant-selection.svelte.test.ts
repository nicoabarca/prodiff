import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "$lib/event-log/types";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";

const listVariants = vi.fn<(...args: unknown[]) => Promise<ResponseVariantRow[]>>();
let compared = ["g1"];

vi.mock("$lib/tree/invokers/list-variants", () => ({
  listVariants: (...args: unknown[]) => listVariants(...args)
}));

vi.mock("$lib/groups/state/comparison.svelte", () => ({
  comparedIds: () => compared
}));

const { createVariantSelection } = await import("$lib/tree/state/variant-selection.svelte");

const project = { id: "p", columns: [] } as unknown as Project;

/** Four Variants over 100 cases, so the 0.8 coverage default takes the first two. */
function rows(): ResponseVariantRow[] {
  return [
    { key: "a", activities: ["A"], cases: { g1: 50 } },
    { key: "b", activities: ["B"], cases: { g1: 30 } },
    { key: "c", activities: ["C"], cases: { g1: 15 } },
    { key: "d", activities: ["D"], cases: { g1: 5 } }
  ];
}

function harness(onEmpty: "coverage" | "all", applied: string[] = []) {
  const persisted = { keys: applied };
  const persist = vi.fn(async (_project: Project, keys: string[]) => {
    persisted.keys = keys;
  });
  const selection = createVariantSelection({
    applied: () => persisted.keys,
    persist,
    onEmpty
  });
  return { selection, persisted, persist };
}

beforeEach(() => {
  listVariants.mockReset();
  listVariants.mockResolvedValue(rows());
  compared = ["g1"];
});

describe("an empty selection", () => {
  it("is re-seeded from the coverage default under 'coverage'", async () => {
    const { selection, persisted } = harness("coverage");

    await selection.loadVariants(project);

    expect(persisted.keys).toEqual(["a", "b"]);
    expect(selection.selectedVariants()).toEqual(new Set(["a", "b"]));
  });

  it("stands for every Variant under 'all'", async () => {
    const { selection, persisted, persist } = harness("all");

    await selection.loadVariants(project);

    expect(persisted.keys).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    expect(selection.selectedVariants()).toEqual(new Set(["a", "b", "c", "d"]));
  });
});

describe("loadVariants", () => {
  it("drops the keys that no longer exist and counts them", async () => {
    const { selection, persisted } = harness("coverage", ["a", "gone"]);

    await selection.loadVariants(project);

    expect(persisted.keys).toEqual(["a"]);
    expect(selection.variants.dropped).toBe(1);
  });

  it("prunes a pending edit the same way, leaving the rest of it standing", async () => {
    const { selection } = harness("coverage", ["a"]);
    selection.setStaged(["a", "c", "gone"]);

    await selection.loadVariants(project);

    expect(selection.stagedVariants()).toEqual(new Set(["a", "c"]));
  });

  it("holds the list it has for the same Groups, and loads again for others", async () => {
    const { selection } = harness("all");

    await selection.loadVariants(project);
    await selection.loadVariants(project);
    expect(listVariants).toHaveBeenCalledTimes(1);

    compared = ["g1", "g2"];
    await selection.loadVariants(project);
    expect(listVariants).toHaveBeenCalledTimes(2);
  });

  it("loads again for the same Groups when forced", async () => {
    const { selection } = harness("all");

    await selection.loadVariants(project);
    await selection.loadVariants(project, true);

    expect(listVariants).toHaveBeenCalledTimes(2);
  });

  it("reports a failure without clearing the selection", async () => {
    listVariants.mockRejectedValue(new Error("no such group"));
    const { selection, persisted } = harness("coverage", ["a"]);

    await selection.loadVariants(project);

    expect(selection.variants.error).toContain("no such group");
    expect(persisted.keys).toEqual(["a"]);
  });
});

describe("staging", () => {
  it("is clean until an edit differs from what is applied", () => {
    const { selection } = harness("coverage", ["a", "b"]);

    expect(selection.isStagedDirty()).toBe(false);
    selection.setStaged(["b", "a"]);
    expect(selection.isStagedDirty()).toBe(false);
    selection.toggleStaged("c");
    expect(selection.isStagedDirty()).toBe(true);
  });

  it("falls back to the applied selection with no edit pending", () => {
    const { selection } = harness("coverage", ["a"]);

    expect(selection.stagedVariants()).toEqual(new Set(["a"]));
  });

  it("drops the edit on reset", () => {
    const { selection } = harness("coverage", ["a"]);
    selection.setStaged(["c"]);

    selection.resetStaged();

    expect(selection.stagedVariants()).toEqual(new Set(["a"]));
    expect(selection.isStagedDirty()).toBe(false);
  });

  it("writes the edit through on apply and closes it", async () => {
    const { selection, persisted } = harness("coverage", ["a"]);
    selection.setStaged(["b", "c"]);

    await selection.applyStaged(project);

    expect(persisted.keys).toEqual(["b", "c"]);
    expect(selection.isStagedDirty()).toBe(false);
  });

  it("writes nothing when apply finds no edit", async () => {
    const { selection, persist } = harness("coverage", ["a"]);

    await selection.applyStaged(project);

    expect(persist).not.toHaveBeenCalled();
  });
});

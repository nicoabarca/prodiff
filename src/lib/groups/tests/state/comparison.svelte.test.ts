import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats, ResponseRelation } from "$lib/groups/invokers/types";
import type { Group } from "$lib/groups/types";

const comparisonRelation = vi.fn<(...args: unknown[]) => Promise<ResponseRelation>>();
const toastWarning = vi.fn();

vi.mock("svelte-sonner", () => ({
  toast: { warning: (...args: unknown[]) => toastWarning(...args) }
}));

vi.mock("$lib/groups/invokers/comparison-relation", () => ({
  comparisonRelation: (...args: unknown[]) => comparisonRelation(...args)
}));

vi.mock("$lib/groups/invokers/apply-group", () => ({
  applyGroup: async () => ({}) as ResponseEventLogStats
}));

vi.mock("$lib/db/client", () => ({
  db: () => ({
    update: () => ({ set: () => ({ where: async () => {} }) })
  })
}));

const { applyGroup, groups, recolorGroup, renameGroup } =
  await import("$lib/groups/state/groups.svelte");
const { checkAfterApply, comparison, comparisonKey, loadRelation, relation, relationReady } =
  await import("$lib/groups/state/comparison.svelte");
const { savedComparisons } = await import("$lib/groups/state/saved-comparisons.svelte");

const project = { id: "p", columns: [] } as unknown as Project;
const filters: Filter[] = [{ kind: "attribute", column: "c", mode: "mandatory", values: ["x"] }];

function group(id: string): Group {
  return {
    id,
    projectId: "p",
    name: id,
    color: "group-1",
    position: 0,
    filters,
    stats: {} as ResponseEventLogStats,
    createdAt: "",
    editedAt: ""
  };
}

function summary(status: ResponseRelation["status"]): ResponseRelation {
  return { status, relation: null, inner: null, cases: {}, kept: {}, removed: {} };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  comparisonRelation.mockReset();
  toastWarning.mockReset();
  savedComparisons.splice(0, savedComparisons.length);
  groups.splice(0, groups.length, group("a"), group("b"));
  comparison.projectId = "p";
  comparison.groupIds = ["a", "b"];
  relation.key = null;
  relation.state = "loading";
  relation.summary = null;
  relation.error = null;
});

describe("comparisonKey", () => {
  it("moves when a compared Group is applied, not when it is renamed or recoloured", async () => {
    const before = comparisonKey();
    await renameGroup(groups[0], "Renamed");
    await recolorGroup(groups[0], "group-2");
    expect(comparisonKey()).toBe(before);

    await applyGroup(project, groups[0], filters);
    expect(comparisonKey()).not.toBe(before);
  });
});

describe("loadRelation", () => {
  it("drops a response once what is compared has moved on", async () => {
    const slow = deferred<ResponseRelation>();
    comparisonRelation.mockReturnValueOnce(slow.promise);
    const first = loadRelation(project);

    await applyGroup(project, groups[1], filters);
    comparisonRelation.mockResolvedValueOnce(summary("ok"));
    await loadRelation(project);

    slow.resolve(summary("identical"));
    await first;
    expect(relation.summary?.status).toBe("ok");
    expect(relationReady()).toBe(true);
  });

  it("keeps the views waiting on a refused pair", async () => {
    comparisonRelation.mockResolvedValueOnce(summary("identical"));
    await loadRelation(project);
    expect(relationReady()).toBe(false);
  });

  it("needs no relation for a single Group", () => {
    comparison.groupIds = ["a"];
    expect(relationReady()).toBe(true);
  });
});

describe("checkAfterApply", () => {
  it("warns once per Comparison the Apply broke", async () => {
    savedComparisons.splice(
      0,
      savedComparisons.length,
      { id: "s1", projectId: "p", groupIds: ["a", "b"], createdAt: 0 },
      { id: "s2", projectId: "p", groupIds: ["b", "original"], createdAt: 0 }
    );
    comparisonRelation.mockImplementation(async (_project, ids) =>
      summary((ids as string[]).includes("original") ? "ok" : "identical")
    );

    await checkAfterApply(project, groups[1]);

    expect(comparisonRelation).toHaveBeenCalledTimes(2);
    expect(toastWarning).toHaveBeenCalledOnce();
    expect(toastWarning).toHaveBeenCalledWith(
      "a vs b can no longer be compared: the groups hold the same cases."
    );
  });
});

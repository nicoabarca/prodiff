import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "$lib/event-log/types";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";

const directedTree = vi.fn<(...args: unknown[]) => Promise<ResponseDirectedTree>>();
const persistSettings = vi.fn<() => Promise<void>>();

vi.mock("$lib/tree/invokers/directed-tree", () => ({
  directedTree: (...args: unknown[]) => directedTree(...args)
}));

vi.mock("$lib/db/client", () => ({
  db: () => ({
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => persistSettings() })
    })
  })
}));

const { autoBuild, build, built, isStale, retryBuild } =
  await import("$lib/tree/state/build.svelte");
const { comparison, saveSettings, settings } = await import("$lib/tree/state/tree.svelte");

const project = { id: "p", columns: [] } as unknown as Project;

function tree(variantsTotal = 2): ResponseDirectedTree {
  return {
    nodes: [
      { variantKey: "a" } as ResponseDirectedTree["nodes"][number],
      { variantKey: "b" } as ResponseDirectedTree["nodes"][number]
    ],
    groups: [],
    caseLevelTests: {},
    overlapCases: 0,
    variantsTotal,
    variantsIncluded: 2,
    caseCoverage: 1,
    cappedByCeiling: false,
    transitionTimeBasis: "completeOnly",
    hasActivityDuration: false
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  directedTree.mockReset();
  persistSettings.mockReset();
  persistSettings.mockResolvedValue();
  built.projectId = null;
  built.key = null;
  built.tree = null;
  built.building = false;
  built.error = null;
  comparison.projectId = "p";
  comparison.groupIds = [];
  settings.projectId = "p";
  settings.value = { attributes: [], selectedVariants: ["a", "b"], attributesChosen: true };
});

describe("saveSettings", () => {
  it("leaves the current settings intact when persistence fails", async () => {
    persistSettings.mockRejectedValueOnce(new Error("disk full"));
    const previous = settings.value;

    await expect(
      saveSettings(project.id, { ...previous, attributes: ["Region"] })
    ).rejects.toThrow("disk full");

    expect(settings.value).toBe(previous);
  });
});

describe("autoBuild", () => {
  it("does not build before the first build is asked for", () => {
    autoBuild(project);
    expect(directedTree).not.toHaveBeenCalled();
  });

  it("builds when an input has changed under the tree", async () => {
    directedTree.mockResolvedValue(tree());
    await build(project);

    settings.value = { ...settings.value, attributes: ["Region"] };
    autoBuild(project);
    await vi.waitFor(() => expect(directedTree).toHaveBeenCalledTimes(2));
  });

  it("leaves a tree that still matches its inputs alone", async () => {
    directedTree.mockResolvedValue(tree());
    await build(project);

    autoBuild(project);
    expect(directedTree).toHaveBeenCalledTimes(1);
  });

  it("does not fire again on a key that failed", async () => {
    directedTree.mockResolvedValue(tree());
    await build(project);

    directedTree.mockRejectedValue(new Error("no such group"));
    settings.value = { ...settings.value, attributes: ["Region"] };
    await build(project);
    expect(built.error).toContain("no such group");

    autoBuild(project);
    expect(directedTree).toHaveBeenCalledTimes(2);
  });

  it("builds again once another input changes after a failure", async () => {
    directedTree.mockResolvedValue(tree());
    await build(project);

    directedTree.mockRejectedValue(new Error("no such group"));
    settings.value = { ...settings.value, attributes: ["Region"] };
    await build(project);

    directedTree.mockResolvedValue(tree());
    settings.value = { ...settings.value, attributes: ["Region", "Age"] };
    autoBuild(project);
    await vi.waitFor(() => expect(directedTree).toHaveBeenCalledTimes(3));
  });

  it("retries the key that failed when asked", async () => {
    directedTree.mockResolvedValue(tree());
    await build(project);

    directedTree.mockRejectedValue(new Error("no such group"));
    settings.value = { ...settings.value, attributes: ["Region"] };
    await build(project);

    directedTree.mockResolvedValue(tree());
    retryBuild(project);
    await vi.waitFor(() => expect(built.error).toBeNull());
    expect(directedTree).toHaveBeenCalledTimes(3);
  });
});

describe("build", () => {
  it("drops the result of a build a newer one overtook", async () => {
    const first = deferred<ResponseDirectedTree>();
    const second = deferred<ResponseDirectedTree>();
    directedTree.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const older = build(project);
    const newer = build(project);

    first.resolve(tree(11));
    second.resolve(tree(22));
    await Promise.all([older, newer]);

    expect(built.tree?.variantsTotal).toBe(22);
    expect(built.building).toBe(false);
  });

  it("keeps the newer build's tree when the overtaken one fails", async () => {
    const first = deferred<ResponseDirectedTree>();
    const second = deferred<ResponseDirectedTree>();
    directedTree.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const older = build(project);
    const newer = build(project);

    second.resolve(tree(22));
    first.reject(new Error("cancelled"));
    await Promise.all([older, newer]);

    expect(built.tree?.variantsTotal).toBe(22);
    expect(built.error).toBeNull();
  });

  it("rebuilds when an edit overtakes the first build", async () => {
    const pending = deferred<ResponseDirectedTree>();
    directedTree.mockReturnValueOnce(pending.promise);
    const outdated = build(project);

    settings.value = { ...settings.value, attributes: ["Region"] };
    pending.resolve(tree(11));
    await outdated;

    expect(built.tree).toBeNull();
    directedTree.mockResolvedValueOnce(tree(22));
    autoBuild(project);
    await vi.waitFor(() => expect(built.tree?.variantsTotal).toBe(22));
  });

  it("rebuilds instead of adopting a response overtaken by an edit", async () => {
    directedTree.mockResolvedValueOnce(tree());
    await build(project);

    const pending = deferred<ResponseDirectedTree>();
    directedTree.mockReturnValueOnce(pending.promise);
    settings.value = { ...settings.value, attributes: ["Region"] };
    const outdated = build(project);

    settings.value = {
      ...settings.value,
      attributes: ["Age"],
      selectedVariants: ["newer-selection"]
    };
    autoBuild(project);
    pending.resolve(tree(11));
    await outdated;

    expect(built.tree?.variantsTotal).toBe(2);
    expect(settings.value.selectedVariants).toEqual(["newer-selection"]);
    expect(isStale()).toBe(true);

    directedTree.mockResolvedValueOnce(tree(22));
    autoBuild(project);
    await vi.waitFor(() => expect(built.tree?.variantsTotal).toBe(22));
    expect(isStale()).toBe(false);
  });
});

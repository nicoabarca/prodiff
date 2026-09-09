import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "$lib/event-log/types";
import type { ResponseDirectedTree } from "$lib/tree/invokers/types";

const directedTree = vi.fn<(...args: unknown[]) => Promise<ResponseDirectedTree>>();

vi.mock("$lib/tree/invokers/directed-tree", () => ({
  directedTree: (...args: unknown[]) => directedTree(...args)
}));

// Settings are persisted on every build that adopts what the backend included;
// nothing here reads them back.
vi.mock("$lib/db/client", () => ({
  db: () => ({
    insert: () => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() })
    })
  })
}));

const { autoBuild, build, built, comparison, retryBuild, settings } =
  await import("$lib/tree/state/tree.svelte");

const project = { id: "p", columns: [] } as unknown as Project;

/**
 * A tree carrying the two Variants the settings select, so nothing is adopted.
 * `variantsTotal` names the build it came from: the state is a proxy, so which
 * tree landed is read off a field rather than by identity.
 */
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
});

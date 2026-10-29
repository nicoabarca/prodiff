import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { Manifest } from "$lib/project-import/types";

const calls = vi.hoisted(() => ({
  projects: [] as { id: string }[],
  order: [] as string[],
  openBundle: vi.fn(),
  discardBundle: vi.fn(),
  importProject: vi.fn(),
  addProject: vi.fn(),
  addCustomAttributes: vi.fn(),
  addGroups: vi.fn()
}));

const record = (name: string) => () => {
  calls.order.push(name);
  return Promise.resolve();
};

vi.mock("$lib/project-import/invokers/open-bundle", () => ({ openBundle: calls.openBundle }));
vi.mock("$lib/project-import/invokers/discard-bundle", () => ({
  discardBundle: calls.discardBundle
}));
vi.mock("$lib/project-import/invokers/import-project", () => ({
  importProject: calls.importProject
}));
vi.mock("$lib/event-log/state/projects.svelte", () => ({
  projects: calls.projects,
  addProject: calls.addProject,
  forgetProjectRow: vi.fn(record("project"))
}));
vi.mock("$lib/custom-attributes/state/custom-attributes.svelte", () => ({
  addCustomAttributes: calls.addCustomAttributes,
  removeCustomAttributesForProject: vi.fn(record("customAttributes"))
}));
vi.mock("$lib/groups/state/groups.svelte", () => ({
  addGroups: calls.addGroups,
  removeGroupsForProject: vi.fn(record("groups"))
}));
vi.mock("$lib/groups/state/saved-comparisons.svelte", () => ({
  deleteSavedComparisonsForProject: vi.fn(record("savedComparisons"))
}));
vi.mock("$lib/groups/state/comparison.svelte", () => ({
  deleteComparison: vi.fn(record("comparison"))
}));
vi.mock("$lib/tree/state/tree.svelte", () => ({ deleteSettings: vi.fn(record("tree")) }));
vi.mock("$lib/dfg/state/variants.svelte", () => ({ deleteSettings: vi.fn(record("dfg")) }));

const { cancelImport, importFailure, prepareImport, runImport } =
  await import("$lib/project-import/utils/import");
const { importedProjectId, ManifestError } = await import("$lib/project-import/utils/manifest");

const manifest: Manifest = {
  formatVersion: 1,
  name: "Study",
  columns: [
    { name: "Case ID", role: "case_id", scope: "case", caseResolution: "constant", type: "string" },
    { name: "Activity", role: "activity_name", scope: "event", type: "string" },
    { name: "Timestamp", role: "complete_timestamp", scope: "event", type: "datetime" },
    { name: "points", role: "other", scope: "event", type: "integer" }
  ],
  hiddenColumns: [],
  customAttributes: [{ name: "Double", formula: "[points] * 2" }],
  groups: [
    {
      name: "High",
      filters: [{ kind: "numeric", attribute: "Double", mode: "above", min: 4, max: null }]
    }
  ]
};

function stats(cases: number): ResponseEventLogStats {
  return {
    events: cases * 2,
    cases,
    activities: 2,
    variants: 1,
    avgEventsPerCase: 2,
    avgCaseDurationMs: null,
    medianCaseDurationMs: null,
    minCaseDurationMs: null,
    maxCaseDurationMs: null,
    startActivities: 1,
    endActivities: 1,
    timespanStart: null,
    timespanEnd: null
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.projects.length = 0;
  calls.order.length = 0;
  calls.openBundle.mockResolvedValue({
    manifestText: JSON.stringify(manifest),
    csvPath: "/imports/fines.csv",
    csvFileName: "fines.csv"
  });
  calls.importProject.mockImplementation((_id, _path, input) =>
    Promise.resolve({
      eventLog: { ...stats(10), originalPath: "/p/fines.csv", eventLogPath: "/p/e.parquet" },
      customAttributes: input.customAttributes.map(({ id }: { id: string }) => ({ id, empty: 0 })),
      groups: [stats(3)]
    })
  );
  calls.addProject.mockImplementation(record("addProject"));
});

describe("prepareImport", () => {
  it("says it replaces only when the Project already exists", async () => {
    expect((await prepareImport("/study.zip")).replaces).toBe(false);
    calls.projects.push({ id: importedProjectId("Study") });
    expect((await prepareImport("/study.zip")).replaces).toBe(true);
    expect(calls.importProject).not.toHaveBeenCalled();
  });
});

describe("discarding the extracted CSV", () => {
  it("discards it when the manifest fails, and rethrows", async () => {
    calls.openBundle.mockResolvedValue({
      manifestText: JSON.stringify({ ...manifest, formatVersion: 2 }),
      csvPath: "/imports/fines.csv",
      csvFileName: "fines.csv"
    });
    await expect(prepareImport("/study.zip")).rejects.toBeInstanceOf(ManifestError);
    expect(calls.discardBundle).toHaveBeenCalledOnce();
  });

  it("keeps it for a manifest that resolves, and discards it on cancel", async () => {
    await prepareImport("/study.zip");
    expect(calls.discardBundle).not.toHaveBeenCalled();
    await cancelImport();
    expect(calls.discardBundle).toHaveBeenCalledOnce();
  });
});

describe("runImport", () => {
  it("sends fx_ columns, then forgets every old row before adding the new ones", async () => {
    const prepared = await prepareImport("/study.zip");
    const imported = await runImport(prepared);

    const [, csvPath, input] = calls.importProject.mock.calls[0];
    expect(csvPath).toBe("/imports/fines.csv");
    const [double] = input.customAttributes;
    expect(input.groups[0].filters[0].column).toBe(`fx_${double.id}`);

    expect(calls.order).toEqual([
      "customAttributes",
      "groups",
      "savedComparisons",
      "comparison",
      "tree",
      "dfg",
      "project",
      "addProject"
    ]);
    expect(calls.addGroups.mock.calls[0][0][0].stats.cases).toBe(3);
    expect(imported).toMatchObject({ groups: 1, project: { cases: 10, fileName: "fines.csv" } });
  });

  it("writes no rows when the build fails", async () => {
    calls.importProject.mockRejectedValue("Group abc: column not found");
    const prepared = await prepareImport("/study.zip");
    await expect(runImport(prepared)).rejects.toBe("Group abc: column not found");
    expect(calls.order).toEqual([]);
    expect(calls.addProject).not.toHaveBeenCalled();
  });
});

describe("importFailure", () => {
  it("asks for an update on a version error", () => {
    const failure = importFailure(new ManifestError("formatVersion 2", "version"));
    expect(failure.sentence).toBe("Update ProDiff and try again.");
  });

  it("asks for the study file again when the bundle cannot be opened", async () => {
    calls.openBundle.mockRejectedValue("The study file has no manifest.json.");
    const error = await prepareImport("/x.txt").catch((e: unknown) => e);
    expect(importFailure(error)).toEqual({
      sentence: "This is not the study file. Download study.zip again and pick it.",
      detail: "The study file has no manifest.json."
    });
  });

  it("sends a build error to the researcher with the message as detail", () => {
    expect(importFailure("Group abc: column not found")).toEqual({
      sentence: "The study file could not be imported. Send this message to the researcher.",
      detail: "Group abc: column not found"
    });
  });
});

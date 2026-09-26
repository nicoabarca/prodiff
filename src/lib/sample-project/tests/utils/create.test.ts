import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { Group } from "$lib/groups/types";

const calls = vi.hoisted(() => ({
  projects: [] as { id: string }[],
  importSample: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  addGroups: vi.fn(),
  saveComparison: vi.fn(),
  saveSettings: vi.fn(),
  recordSampleVersion: vi.fn()
}));

vi.mock("$lib/sample-project/invokers/create-sample-project", () => ({
  createSampleProject: calls.importSample
}));
vi.mock("$lib/event-log/state/projects.svelte", () => ({
  projects: calls.projects,
  addProject: calls.addProject,
  removeProject: calls.removeProject
}));
vi.mock("$lib/groups/state/groups.svelte", () => ({ addGroups: calls.addGroups }));
vi.mock("$lib/groups/state/comparison.svelte", () => ({ saveComparison: calls.saveComparison }));
vi.mock("$lib/tree/state/tree.svelte", () => ({ saveSettings: calls.saveSettings }));
vi.mock("$lib/sample-project/state/version.svelte", () => ({
  recordSampleVersion: calls.recordSampleVersion
}));

const { createSampleProject } = await import("$lib/sample-project/utils/create");
const { SAMPLE_MANIFEST, SAMPLE_PROJECT_ID } = await import("$lib/sample-project/manifest");

function stats(cases: number): ResponseEventLogStats {
  return {
    events: cases * 5,
    cases,
    activities: 5,
    variants: 2,
    avgEventsPerCase: 5,
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
  calls.importSample.mockResolvedValue({
    eventLog: {
      ...stats(500),
      originalPath: "/p/original.csv",
      eventLogPath: "/p/event_log.parquet"
    },
    groups: [stats(362), stats(138)]
  });
});

describe("createSampleProject", () => {
  it("applies only the applied Groups and stores each one's figures", async () => {
    await createSampleProject();

    const sent = calls.importSample.mock.calls[0][2] as Pick<Group, "id">[];
    const stored = calls.addGroups.mock.calls[0][0] as Group[];
    expect(stored.map((group) => group.name)).toEqual(["Approved", "Rejected", "Slow cases"]);
    expect(sent.map((group) => group.id)).toEqual([stored[0].id, stored[1].id]);
    expect(stored.map((group) => group.stats?.cases ?? null)).toEqual([362, 138, null]);
    expect(stored.every((group) => group.projectId === SAMPLE_PROJECT_ID)).toBe(true);
  });

  it("opens the tree on the compared Groups with the attributes already chosen", async () => {
    await createSampleProject();

    const stored = calls.addGroups.mock.calls[0][0] as Group[];
    expect(calls.saveComparison).toHaveBeenCalledWith(SAMPLE_PROJECT_ID, [
      stored[0].id,
      stored[1].id
    ]);
    expect(calls.saveSettings).toHaveBeenCalledWith(SAMPLE_PROJECT_ID, {
      attributes: SAMPLE_MANIFEST.treeAttributes,
      selectedVariants: [],
      attributesChosen: true
    });
  });

  it("replaces a Sample Project that already exists", async () => {
    calls.projects.push({ id: SAMPLE_PROJECT_ID });
    await createSampleProject();
    expect(calls.removeProject).toHaveBeenCalledWith(SAMPLE_PROJECT_ID);
    expect(calls.addProject).toHaveBeenCalledOnce();
  });

  it("records the version it was created from, once everything else is stored", async () => {
    await createSampleProject();
    const recorded = calls.recordSampleVersion.mock.invocationCallOrder[0];
    expect(recorded).toBeGreaterThan(calls.saveSettings.mock.invocationCallOrder[0]);
  });

  it("writes nothing when the manifest compares a Group that is not applied", async () => {
    await expect(
      createSampleProject({ ...SAMPLE_MANIFEST, compared: ["Slow cases"] })
    ).rejects.toThrow("Slow cases");
    expect(calls.importSample).not.toHaveBeenCalled();
    expect(calls.addProject).not.toHaveBeenCalled();
    expect(calls.recordSampleVersion).not.toHaveBeenCalled();
  });
});

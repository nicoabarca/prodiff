import { describe, expect, it } from "vitest";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { Manifest } from "$lib/project-import/types";
import {
  importedProjectId,
  importedRows,
  ManifestError,
  readManifest,
  resolveManifest
} from "$lib/project-import/utils/manifest";
import seedManifest from "../../../../../scripts/seed_log/road_traffic_fine_10k.json?raw";

const columns: RequestColumnMapping[] = [
  { name: "Case ID", role: "case_id", scope: "case", caseResolution: "constant", type: "string" },
  { name: "Activity", role: "activity_name", scope: "event", type: "string" },
  {
    name: "Timestamp",
    role: "complete_timestamp",
    scope: "event",
    type: "datetime",
    timestampFormat: "YYYY-MM-DD HH:mm"
  },
  { name: "points", role: "other", scope: "event", type: "integer" },
  { name: "amount", role: "other", scope: "case", caseResolution: "first", type: "float" },
  { name: "expense", role: "other", scope: "event", type: "float" }
];

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    formatVersion: 1,
    name: "Study",
    columns,
    hiddenColumns: [],
    customAttributes: [{ name: "Ratio", formula: "[points] / [amount]" }],
    groups: [
      {
        name: "High ratio",
        filters: [{ kind: "numeric", column: "Ratio", mode: "above", min: 0.5, max: null }]
      },
      {
        name: "Large",
        filters: [{ kind: "numeric", column: "amount", mode: "above", min: 50, max: null }]
      },
      {
        name: "Rest",
        filters: [{ kind: "case_not_in_group", group: "Large" }]
      }
    ],
    ...overrides
  };
}

function read(value: unknown): Manifest {
  return readManifest(JSON.stringify(value));
}

function stats(cases: number): ResponseEventLogStats {
  return {
    events: cases * 3,
    cases,
    activities: 3,
    variants: 1,
    avgEventsPerCase: 3,
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

describe("readManifest", () => {
  it("refuses text that is not JSON", () => {
    expect(() => readManifest("{")).toThrow(/not valid JSON/);
  });

  it("refuses another format version as a version error", () => {
    for (const formatVersion of [undefined, 2]) {
      try {
        read({ ...manifest(), formatVersion });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(ManifestError);
        expect((error as ManifestError).kind).toBe("version");
      }
    }
  });

  it("refuses an unknown filter kind, naming the Group and position", () => {
    const groups = [{ name: "Odd", filters: [{ kind: "colour" }] }];
    expect(() => read({ ...manifest(), groups })).toThrow(/Group "Odd", filter 1: unknown kind/);
  });

  it("refuses two Groups with one name", () => {
    const groups = [
      { name: "Same", filters: [] },
      { name: "Same", filters: [] }
    ];
    expect(() => read({ ...manifest(), groups })).toThrow(/Two Groups are called "Same"/);
  });

  it("refuses a hidden column that is not a column", () => {
    expect(() => read({ ...manifest(), hiddenColumns: ["nope"] })).toThrow(
      /"nope" is not a column/
    );
  });

  it("reads the committed seed manifest, which resolves", () => {
    const seed = readManifest(seedManifest);
    expect(() => resolveManifest(seed)).not.toThrow();
  });
});

describe("resolveManifest", () => {
  it("points a Custom Attribute name in a column at its fx_ column", () => {
    const resolved = resolveManifest(manifest());
    const [ratio] = resolved.customAttributes;
    expect(resolved.groups[0].filters[0]).toMatchObject({ column: `fx_${ratio.id}` });
  });

  it("leaves a raw column name alone", () => {
    const resolved = resolveManifest(manifest());
    expect(resolved.groups[1].filters[0]).toMatchObject({ column: "amount" });
  });

  it("points case_not_in_group at an earlier Group's id", () => {
    const resolved = resolveManifest(manifest());
    expect(resolved.groups[2].filters[0]).toEqual({
      kind: "case_not_in_group",
      groupId: resolved.groups[1].id
    });
  });

  it("refuses case_not_in_group naming a later Group", () => {
    const groups = [
      { name: "First", filters: [{ kind: "case_not_in_group" as const, group: "Second" }] },
      { name: "Second", filters: [] }
    ];
    expect(() => resolveManifest(manifest({ groups }))).toThrow(/not an earlier Group/);
  });

  it("refuses a formula reading a hidden column", () => {
    expect(() => resolveManifest(manifest({ hiddenColumns: ["points"] }))).toThrow(
      /Custom attribute "Ratio"/
    );
  });
});

describe("importedRows", () => {
  it("lines positions, colours and stats up with the Groups' order", () => {
    const resolved = resolveManifest(manifest());
    const built = {
      eventLog: {
        ...stats(9),
        originalPath: "/p/fines.csv",
        eventLogPath: "/p/event_log.parquet"
      },
      customAttributes: [{ id: resolved.customAttributes[0].id, empty: 2 }],
      groups: [stats(1), stats(2), stats(3)]
    };
    const id = importedProjectId("Study");
    const rows = importedRows(id, resolved, built, "fines.csv", "2026-10-29T00:00:00.000Z");

    expect(rows.project).toMatchObject({ id, name: "Study", fileName: "fines.csv", cases: 9 });
    expect(rows.customAttributes[0]).toMatchObject({
      formula: "[points] / [amount]",
      emptyCount: 2
    });
    expect(rows.groups.map((group) => [group.position, group.stats?.cases])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3]
    ]);
    expect(new Set(rows.groups.map((group) => group.color)).size).toBe(3);
  });

  it("gives one manifest name the same Project id every time", () => {
    expect(importedProjectId("Study")).toBe(importedProjectId("Study"));
    expect(importedProjectId("Study")).not.toBe(importedProjectId("Other"));
  });
});

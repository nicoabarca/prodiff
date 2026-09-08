import { describe, expect, it } from "vitest";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";
import {
  categoricalColumns,
  eventLevelColumns,
  numericColumns
} from "$lib/filters/utils/columns";

function column(
  name: string,
  type: RequestColumnMapping["type"],
  overrides: Partial<RequestColumnMapping> = {}
): RequestColumnMapping {
  return { name, type, role: "other", granularity: "event", ...overrides };
}

function project(columns: RequestColumnMapping[], hiddenColumns: string[] = []): Project {
  return {
    id: "p",
    name: "p",
    fileName: "p.csv",
    originalPath: "",
    eventLogPath: "",
    columns,
    hiddenColumns,
    events: 0,
    cases: 0,
    activities: 0,
    variants: 0,
    timespanStart: null,
    timespanEnd: null,
    createdAt: ""
  };
}

describe("column lists", () => {
  const columns = [
    column("zone", "string"),
    column("Amount", "float"),
    column("beta", "string"),
    column("Alpha", "string"),
    column("region", "string", { granularity: "case" }),
    column("count", "integer")
  ];

  it("orders categorical columns by name", () => {
    expect(categoricalColumns(project(columns)).map((c) => c.name)).toEqual([
      "Alpha",
      "beta",
      "region",
      "zone"
    ]);
  });

  it("orders numeric columns by name", () => {
    expect(numericColumns(project(columns)).map((c) => c.name)).toEqual(["Amount", "count"]);
  });

  it("keeps the order once case-level columns are dropped", () => {
    expect(eventLevelColumns(project(columns)).map((c) => c.name)).toEqual([
      "Alpha",
      "beta",
      "zone"
    ]);
  });

  it("leaves hidden columns out", () => {
    expect(categoricalColumns(project(columns, ["beta"])).map((c) => c.name)).toEqual([
      "Alpha",
      "region",
      "zone"
    ]);
  });
});

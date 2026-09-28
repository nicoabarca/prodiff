import { describe, expect, it } from "vitest";
import type { Project } from "$lib/event-log/types";
import { editedColumns, savedColumns } from "$lib/event-log/utils/column-edits";

const project = {
  columns: [
    { name: "case", role: "case_id", scope: "event", type: "string" },
    { name: "cost", role: "other", scope: "event", type: "integer" },
    { name: "brand", role: "other", scope: "case", caseResolution: "first", type: "string" },
    { name: "due", role: "other", scope: "event", type: "date", timestampFormat: "DD/MM/YYYY" }
  ],
  hiddenColumns: ["brand"]
} as unknown as Project;

describe("editedColumns", () => {
  it("marks nothing changed without edits", () => {
    expect(editedColumns(project, {}).some((column) => column.changed)).toBe(false);
  });

  it("tells a visibility change from a structural one", () => {
    const [, cost, brand] = editedColumns(project, {
      cost: { visible: false },
      brand: { caseResolution: "last" }
    });
    expect(cost).toMatchObject({ changed: true, structural: false, visible: false });
    expect(brand).toMatchObject({ changed: true, structural: true });
  });

  it("ignores an edit back to the saved value", () => {
    const [, cost] = editedColumns(project, { cost: { type: "number", visible: true } });
    expect(cost.changed).toBe(false);
  });
});

describe("savedColumns", () => {
  it("keeps an unedited type exactly as declared", () => {
    const { columns } = savedColumns(project, { cost: { scope: "case" } });
    expect(columns[1]).toEqual({
      name: "cost",
      role: "other",
      scope: "case",
      caseResolution: "constant",
      type: "integer"
    });
    expect(columns[3]).toBe(project.columns[3]);
  });

  it("converts a retyped column", () => {
    const { columns } = savedColumns(project, { due: { type: "string" } });
    expect(columns[3]).toEqual({ name: "due", role: "other", scope: "event", type: "string" });
  });

  it("rewrites the hidden columns from the edits", () => {
    const { hiddenColumns } = savedColumns(project, {
      brand: { visible: true },
      cost: { visible: false }
    });
    expect(hiddenColumns).toEqual(["cost"]);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  analysisColumns,
  customAttributes,
  customAttributesLoaded,
  isCaseAttribute
} from "$lib/custom-attributes/state/custom-attributes.svelte";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import type { Project } from "$lib/event-log/types";

const project = {
  id: "p",
  columns: [
    { name: "case", role: "case_id", scope: "case", caseResolution: "constant", type: "string" }
  ]
} as unknown as Project;

function attribute(
  id: string,
  scope: CustomAttribute["scope"],
  emptyCount: number | null
): CustomAttribute {
  return {
    id,
    projectId: "p",
    name: id,
    scope,
    formula: "",
    position: 0,
    emptyCount,
    createdAt: "",
    editedAt: ""
  };
}

describe("analysisColumns", () => {
  beforeEach(() => {
    customAttributes.splice(
      0,
      customAttributes.length,
      attribute("e1", "event", 0),
      attribute("c1", "case", 3),
      attribute("c2", "case", null)
    );
    customAttributesLoaded.projectId = "p";
  });

  it("adds each applied attribute's column, a Case attribute as a constant case column", () => {
    expect(analysisColumns(project)).toEqual([
      ...project.columns,
      { name: "fx_e1", role: "other", type: "float", scope: "event" },
      { name: "fx_c1", role: "other", type: "float", scope: "case", caseResolution: "constant" }
    ]);
  });

  it("knows an applied Case attribute's column", () => {
    expect(["fx_e1", "fx_c1", "fx_c2", "case"].map(isCaseAttribute)).toEqual([
      false,
      true,
      false,
      false
    ]);
  });

  it("adds nothing for another project", () => {
    expect(analysisColumns({ ...project, id: "q" })).toEqual(project.columns);
  });
});

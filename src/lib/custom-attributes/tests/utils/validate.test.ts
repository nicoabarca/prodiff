import { describe, expect, it } from "vitest";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import { parseFormula } from "$lib/custom-attributes/utils/parser";
import {
  formulaColumnError,
  nameError,
  operandColumns,
  referencedColumns
} from "$lib/custom-attributes/utils/validate";
import type { Project } from "$lib/event-log/types";

const project = {
  id: "p",
  columns: [
    { name: "case", role: "case_id", scope: "event", type: "integer" },
    { name: "activity", role: "activity_name", scope: "event", type: "string" },
    { name: "points", role: "other", scope: "event", type: "integer" },
    { name: "expense", role: "other", scope: "event", type: "float" },
    { name: "secret", role: "other", scope: "event", type: "float" },
    { name: "Resource", role: "other", scope: "event", type: "string" }
  ],
  hiddenColumns: ["secret"]
} as unknown as Project;

function formula(text: string) {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(result.error);
  return result.formula;
}

const attribute = (id: string, name: string) => ({ id, name }) as CustomAttribute;

describe("operandColumns", () => {
  it("offers visible number columns with no role, by name", () => {
    expect(operandColumns(project).map((c) => c.name)).toEqual(["expense", "points"]);
  });
});

describe("referencedColumns", () => {
  it("lists each column once, in order", () => {
    expect(referencedColumns(formula("[b] + -[a] * ([b] - 1)"))).toEqual(["b", "a"]);
  });
});

describe("formulaColumnError", () => {
  it("accepts visible number columns", () => {
    expect(formulaColumnError(formula("[expense] / [points]"), project)).toBeNull();
  });

  it.each([
    ["[pts] + 1", "[pts] matches no column"],
    ["[secret] * 2", "[secret] is hidden"],
    ["[Resource] + 1", "[Resource] is not a number column"],
    ["[case] + 1", "[case] is not a number column"]
  ])("rejects %j", (text, error) => {
    expect(formulaColumnError(formula(text), project)).toBe(error);
  });
});

describe("nameError", () => {
  const others = [attribute("a1", "Paid share")];

  it("accepts a fresh name", () => {
    expect(nameError("Expense per point", project, others, null)).toBeNull();
  });

  it("keeps its own name while editing", () => {
    expect(nameError("paid share", project, others, "a1")).toBeNull();
  });

  it.each([
    ["  ", "Name the attribute"],
    ["EXPENSE", "A column is already called EXPENSE"],
    ["secret", "A column is already called secret"],
    ["transition time", "transition time is a built-in attribute"],
    ["Paid Share", "Another custom attribute is already called Paid Share"]
  ])("rejects %j", (name, error) => {
    expect(nameError(name, project, others, null)).toBe(error);
  });
});

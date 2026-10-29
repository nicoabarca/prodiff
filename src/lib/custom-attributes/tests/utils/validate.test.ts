import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AttributeScope, Formula } from "$lib/custom-attributes/invokers/types";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import { parseFormula } from "$lib/custom-attributes/utils/parser";
import {
  allowedColumns,
  directColumns,
  formulaColumnError,
  nameError,
  referencedColumns
} from "$lib/custom-attributes/utils/validate";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";

/** The validation table's shared vectors, run by Rust's `formula.rs` tests too. */
interface Fixture {
  columns: RequestColumnMapping[];
  hidden: string[];
  cases: {
    name: string;
    scope: AttributeScope;
    text: string;
    formula: Formula;
    expected: "ok" | { refused: string };
  }[];
}

const fixture: Fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "../../../../../src-tauri/tests/fixtures/formula-validation.json"),
    "utf8"
  )
);

const project = {
  id: "p",
  columns: fixture.columns,
  hiddenColumns: fixture.hidden
} as unknown as Project;

function formula(text: string) {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(result.error);
  return result.formula;
}

const attribute = (id: string, name: string) => ({ id, name }) as CustomAttribute;

describe("allowedColumns", () => {
  it.each([
    ["event", "column", ["amount", "points"]],
    ["event", "aggregate", []],
    ["case", "column", ["budget", "paid"]],
    ["case", "aggregate", ["amount", "points"]]
  ] as const)("offers %s scope's visible number %s operands, by name", (scope, operand, names) => {
    expect(allowedColumns(project, scope, operand).map((c) => c.name)).toEqual(names);
  });
});

describe("referencedColumns", () => {
  it("lists each column once, in order, aggregate arguments included", () => {
    expect(referencedColumns(formula("[b] + -sum([a]) * ([b] - count())"))).toEqual(["b", "a"]);
  });
});

describe("directColumns", () => {
  it("lists only the columns read outside a function", () => {
    expect(directColumns(formula("[b] / sum([a]) + max([b]) + [c]"))).toEqual(["b", "c"]);
  });
});

describe("formulaColumnError", () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))("%s", (_, row) => {
    expect(formula(row.text)).toEqual(row.formula);
    const refused = formulaColumnError(row.formula, project, row.scope)?.operand ?? "ok";
    expect(refused).toEqual(row.expected === "ok" ? "ok" : row.expected.refused);
  });

  it.each([
    ["event", "[pts] + 1", "[pts] matches no column"],
    ["event", "[secret] * 2", "[secret] is hidden"],
    ["event", "[resource] + 1", "[resource] is not a number column"],
    ["event", "[case] + 1", "[case] is not a number column"],
    ["event", "[budget] * 2", "[budget] is a case column. Only a Case attribute can read it"],
    ["event", "1 + max([amount])", "max() is only available for Case attributes"],
    ["event", "duration()", "duration() is only available for Case attributes"],
    [
      "case",
      "[amount] / duration()",
      "[amount] is an event column. Wrap it in a function, as in sum([amount]), or make an Event attribute instead"
    ],
    [
      "case",
      "sum([budget])",
      "sum() reads event columns, and [budget] is a case column. Use [budget] on its own"
    ]
  ] as const)("in %s scope, says why %j is refused", (scope, text, message) => {
    expect(formulaColumnError(formula(text), project, scope)?.message).toBe(message);
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
    ["AMOUNT", "A column is already called AMOUNT"],
    ["secret", "A column is already called secret"],
    ["transition time", "transition time is a built-in attribute"],
    ["waiting time", "waiting time is a built-in attribute"],
    ["Service Time", "Service Time is a built-in attribute"],
    ["Paid Share", "Another custom attribute is already called Paid Share"]
  ])("rejects %j", (name, error) => {
    expect(nameError(name, project, others, null)).toBe(error);
  });
});

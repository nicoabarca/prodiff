import { describe, expect, it } from "vitest";
import { parseFormula } from "$lib/custom-attributes/utils/parser";
import { printFormula } from "$lib/custom-attributes/utils/print";

function roundTrip(text: string): string {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(result.error);
  return printFormula(result.formula);
}

describe("printFormula", () => {
  it.each([
    ["[expense]/[points]", "[expense] / [points]"],
    ["([a] * [b]) + 2", "[a] * [b] + 2"],
    ["([a] + [b]) * 2", "([a] + [b]) * 2"],
    ["[a] - ([b] - [c])", "[a] - ([b] - [c])"],
    ["([a] - [b]) - [c]", "[a] - [b] - [c]"],
    ["[a] / ([b] * [c])", "[a] / ([b] * [c])"],
    ["-([a] + 1)", "-([a] + 1)"],
    ["-[a] * 2", "-[a] * 2"],
    ["[a]]b] + 0.25", "[a]]b] + 0.25"]
  ])("prints %j as %j", (text, printed) => {
    expect(roundTrip(text)).toBe(printed);
  });

  it("prints text that parses back to the same tree", () => {
    for (const text of ["[a] - ([b] - [c]) * -(2 + [d])", "((([x])))", "[a] / [b] / [c]"]) {
      const first = parseFormula(text);
      const again = parseFormula(roundTrip(text));
      expect(again).toEqual(first);
    }
  });
});

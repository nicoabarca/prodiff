import { describe, expect, it } from "vitest";
import { parseFormula } from "$lib/custom-attributes/utils/parser";

function parsed(text: string) {
  const result = parseFormula(text);
  if (!result.ok) throw new Error(result.error);
  return result.formula;
}

const col = (name: string) => ({ kind: "column", name });
const num = (value: number) => ({ kind: "number", value });

describe("parseFormula", () => {
  it("reads a ratio of two columns", () => {
    expect(parsed("[expense] / [points]")).toEqual({
      kind: "binary",
      op: "/",
      left: col("expense"),
      right: col("points")
    });
  });

  it("binds * and / tighter than + and -", () => {
    expect(parsed("[a] + [b] * 2")).toEqual({
      kind: "binary",
      op: "+",
      left: col("a"),
      right: { kind: "binary", op: "*", left: col("b"), right: num(2) }
    });
  });

  it("groups operators of the same precedence to the left", () => {
    expect(parsed("[a] - [b] - [c]")).toEqual({
      kind: "binary",
      op: "-",
      left: { kind: "binary", op: "-", left: col("a"), right: col("b") },
      right: col("c")
    });
  });

  it("lets parentheses override precedence", () => {
    expect(parsed("([a] + [b]) * 2")).toEqual({
      kind: "binary",
      op: "*",
      left: { kind: "binary", op: "+", left: col("a"), right: col("b") },
      right: num(2)
    });
  });

  it("reads unary minus, repeated", () => {
    expect(parsed("--[a]")).toEqual({
      kind: "negate",
      operand: { kind: "negate", operand: col("a") }
    });
    expect(parsed("[a] * -1.5")).toEqual({
      kind: "binary",
      op: "*",
      left: col("a"),
      right: { kind: "negate", operand: num(1.5) }
    });
  });

  it("keeps spaces inside column names and unescapes ]]", () => {
    expect(parsed("[Transition Time]")).toEqual(col("Transition Time"));
    expect(parsed("[a]]b]")).toEqual(col("a]b"));
  });

  it("ignores whitespace between tokens", () => {
    expect(parsed("  [a]*2 ")).toEqual(parsed("[a] * 2"));
  });

  it.each([
    ["", "Write a formula", 0],
    ["[a] +", "The formula ends too early", 5],
    ["[a", "Close the column name with ]", 0],
    ["[ ]", "Name a column between the brackets", 0],
    ["([a] + 1", "Close this ( with )", 0],
    ["[a])", "This ) has no matching (", 3],
    ["[a] [b]", "Add an operator here", 4],
    ["[a] % 2", '"%" is not part of a formula', 4],
    ["* [a]", "Expected a column, a number or ( here", 0],
    ["1.", '"." is not part of a formula', 1]
  ])("rejects %j", (text, error, at) => {
    expect(parseFormula(text)).toEqual({ ok: false, error, at });
  });
});

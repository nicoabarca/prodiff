import type { Formula } from "$lib/custom-attributes/invokers/types";

/** How tightly each node binds. An atom never needs parentheses. */
function precedence(formula: Formula): number {
  if (formula.kind === "binary") return formula.op === "+" || formula.op === "-" ? 1 : 2;
  if (formula.kind === "negate") return 3;
  return 4;
}

export function columnReference(name: string): string {
  return `[${name.replaceAll("]", "]]")}]`;
}

/**
 * The canonical text of a formula, with only the parentheses its shape needs.
 * Parsing the result gives back the same tree: operators are left-associative,
 * so a right operand at the same precedence keeps its parentheses.
 */
export function printFormula(formula: Formula): string {
  switch (formula.kind) {
    case "column":
      return columnReference(formula.name);
    case "number":
      return String(formula.value);
    case "negate": {
      const operand = printFormula(formula.operand);
      return precedence(formula.operand) < 3 ? `-(${operand})` : `-${operand}`;
    }
    case "binary": {
      const own = precedence(formula);
      const left = printFormula(formula.left);
      const right = printFormula(formula.right);
      return [
        precedence(formula.left) < own ? `(${left})` : left,
        formula.op,
        precedence(formula.right) <= own ? `(${right})` : right
      ].join(" ");
    }
  }
}

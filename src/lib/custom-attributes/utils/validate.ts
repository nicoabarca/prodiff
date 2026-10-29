import type { AttributeScope, Formula } from "$lib/custom-attributes/invokers/types";
import type { ColumnScope, RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";
import { ACTIVITY_DURATION, builtInLabel, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import { columnReference } from "$lib/custom-attributes/utils/print";

/** A node that reads the case or its columns. Numbers and operators are allowed in every scope. */
type Operand = Extract<Formula, { kind: "column" | "aggregate" | "count" | "duration" }>;

/** What an operand needs in one scope. `reads` wants a visible number column with no role, of that column scope. */
type Rule = { reads: ColumnScope } | "allowed" | "refused";

/**
 * The validation table, mirrored by `rule` in
 * `src-tauri/src/custom_attributes/formula.rs`.
 */
const RULES: Record<Operand["kind"], Record<AttributeScope, Rule>> = {
  column: { event: { reads: "event" }, case: { reads: "case" } },
  aggregate: { event: "refused", case: { reads: "event" } },
  count: { event: "refused", case: "allowed" },
  duration: { event: "refused", case: "allowed" }
};

/**
 * Columns a formula of `scope` may read, by name: as a direct `[x]` operand,
 * or as an aggregate's argument.
 */
export function allowedColumns(
  project: Project,
  scope: AttributeScope,
  as: "column" | "aggregate"
): RequestColumnMapping[] {
  const rule = RULES[as][scope];
  if (typeof rule === "string") return [];
  return project.columns
    .filter(
      (c) =>
        c.role === "other" &&
        (c.type === "integer" || c.type === "float") &&
        c.scope === rule.reads &&
        !project.hiddenColumns.includes(c.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The operands in the order they are written. */
function operands(formula: Formula): Operand[] {
  switch (formula.kind) {
    case "number":
      return [];
    case "negate":
      return operands(formula.operand);
    case "binary":
      return [...operands(formula.left), ...operands(formula.right)];
    default:
      return [formula];
  }
}

function columnOf(operand: Operand): string | null {
  if (operand.kind === "column") return operand.name;
  if (operand.kind === "aggregate") return operand.column;
  return null;
}

/** Every column a formula reads, aggregate arguments included, each once, in order. */
export function referencedColumns(formula: Formula): string[] {
  return [...new Set(operands(formula).flatMap((o) => columnOf(o) ?? []))];
}

/** The columns a formula reads as direct `[x]` operands, each once, in order. */
export function directColumns(formula: Formula): string[] {
  return [...new Set(operands(formula).flatMap((o) => (o.kind === "column" ? [o.name] : [])))];
}

/**
 * Why a formula cannot be computed. `operand` names what to highlight: the
 * column, or the function written as `sum()` when the function itself is
 * refused.
 */
export interface FormulaRefusal {
  operand: string;
  message: string;
}

function functionName(operand: Operand): string {
  return operand.kind === "aggregate" ? operand.fn : operand.kind;
}

function columnRefusal(
  operand: Operand,
  name: string,
  wanted: ColumnScope,
  project: Project
): string | null {
  const reference = columnReference(name);
  const column = project.columns.find((c) => c.name === name);
  if (!column) return `${reference} matches no column`;
  if (project.hiddenColumns.includes(name)) return `${reference} is hidden`;
  if (column.role !== "other" || (column.type !== "integer" && column.type !== "float")) {
    return `${reference} is not a number column`;
  }
  if (column.scope === wanted) return null;
  if (operand.kind === "aggregate") {
    return `${operand.fn}() reads event columns, and ${reference} is a case column. Use ${reference} on its own`;
  }
  return wanted === "case"
    ? `${reference} is an event column. Wrap it in a function, as in sum(${reference}), or make an Event attribute instead`
    : `${reference} is a case column. Only a Case attribute can read it`;
}

/** The first operand a formula of `scope` may not read on this project, or null when it can be computed. */
export function formulaColumnError(
  formula: Formula,
  project: Project,
  scope: AttributeScope
): FormulaRefusal | null {
  for (const operand of operands(formula)) {
    const rule = RULES[operand.kind][scope];
    if (rule === "allowed") continue;
    if (rule === "refused") {
      const name = functionName(operand);
      return {
        operand: `${name}()`,
        message: `${name}() is only available for Case attributes`
      };
    }
    const name = columnOf(operand);
    if (name === null) continue;
    const message = columnRefusal(operand, name, rule.reads, project);
    if (message) return { operand: name, message };
  }
  return null;
}

/**
 * Why a name cannot be used, or null when it can. Names sit side by side with
 * every column and derived attribute in the pickers, so they must not clash
 * with any of them, ignoring case.
 */
export function nameError(
  name: string,
  project: Project,
  attributes: CustomAttribute[],
  selfId: string | null
): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Name the attribute";
  const key = trimmed.toLocaleLowerCase();
  const same = (other: string) => other.toLocaleLowerCase() === key;
  if (project.columns.some((c) => same(c.name))) return `A column is already called ${trimmed}`;
  if ([ACTIVITY_DURATION, TRANSITION_TIME].some((name) => same(name) || same(builtInLabel(name)))) {
    return `${trimmed} is a built-in attribute`;
  }
  if (attributes.some((a) => a.id !== selfId && same(a.name))) {
    return `Another custom attribute is already called ${trimmed}`;
  }
  return null;
}

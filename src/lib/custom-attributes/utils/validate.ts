import type { Formula } from "$lib/custom-attributes/invokers/types";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import { columnReference } from "$lib/custom-attributes/utils/print";

/** Columns a formula may read: visible number columns with no process-mining role. */
export function operandColumns(project: Project): RequestColumnMapping[] {
  return project.columns
    .filter(
      (c) =>
        c.role === "other" &&
        (c.type === "integer" || c.type === "float") &&
        !project.hiddenColumns.includes(c.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every column a formula reads, each once, in the order they first appear. */
export function referencedColumns(formula: Formula): string[] {
  const names = new Set<string>();
  const visit = (node: Formula) => {
    if (node.kind === "column") names.add(node.name);
    else if (node.kind === "negate") visit(node.operand);
    else if (node.kind === "binary") {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(formula);
  return [...names];
}

/** Why a formula cannot be computed on this project, or null when it can. */
export function formulaColumnError(formula: Formula, project: Project): string | null {
  const operands = new Set(operandColumns(project).map((c) => c.name));
  for (const name of referencedColumns(formula)) {
    if (operands.has(name)) continue;
    const column = project.columns.find((c) => c.name === name);
    if (!column) return `${columnReference(name)} matches no column`;
    if (project.hiddenColumns.includes(name)) return `${columnReference(name)} is hidden`;
    return `${columnReference(name)} is not a number column`;
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
  if (same(ACTIVITY_DURATION) || same(TRANSITION_TIME)) return `${trimmed} is a built-in attribute`;
  if (attributes.some((a) => a.id !== selfId && same(a.name))) {
    return `Another custom attribute is already called ${trimmed}`;
  }
  return null;
}

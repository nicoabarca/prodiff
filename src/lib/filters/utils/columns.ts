import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";

/**
 * Which columns each filter kind may read. One home for the rule, so the kind
 * picker's availability check and the editor that reads a column agree.
 */

/** Column lists are read as menus, so they are ordered by name, not by file position. */
function byName(columns: RequestColumnMapping[]): RequestColumnMapping[] {
  return [...columns].sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything the project has not hidden. Hidden columns are inert everywhere. */
export function usableColumns(project: Project): RequestColumnMapping[] {
  return project.columns.filter((c) => !project.hiddenColumns.includes(c.name));
}

/** The activity column's name, or `""` when the project has none usable. */
export function activityColumn(project: Project): string {
  return usableColumns(project).find((c) => c.role === "activity_name")?.name ?? "";
}

/**
 * Columns an attribute or endpoint filter can select on. Case ids and
 * timestamps are excluded: filtering by one case id is not a Group, and
 * timestamps have their own filter kind.
 */
export function categoricalColumns(project: Project): RequestColumnMapping[] {
  return byName(usableColumns(project)).filter(
    (c) =>
      (c.type === "string" || c.type === "boolean") &&
      c.role !== "case_id" &&
      c.role !== "complete_timestamp" &&
      c.role !== "start_timestamp"
  );
}

/** Columns a numeric filter can bound. */
export function numericColumns(project: Project): RequestColumnMapping[] {
  return byName(usableColumns(project)).filter((c) => c.type === "integer" || c.type === "float");
}

/**
 * Columns a follower filter can read. A case-level column holds one value for
 * the whole case, so it can never produce a reference/follower pair.
 */
export function eventLevelColumns(project: Project): RequestColumnMapping[] {
  return categoricalColumns(project).filter((c) => c.scope !== "case");
}

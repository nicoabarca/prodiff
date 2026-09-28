import type {
  CaseResolution,
  ColumnScope,
  RequestColumnMapping
} from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";
import {
  extraFieldTypeToColumnType,
  inferExtraFieldType,
  scopingOf,
  typingOf,
  type ExtraFieldType
} from "$lib/event-log/utils/field-settings";

/** An unsaved change to one column. Absent fields keep the saved value. */
export interface ColumnEdit {
  visible?: boolean;
  scope?: ColumnScope;
  caseResolution?: CaseResolution;
  type?: ExtraFieldType;
}

/** Unsaved changes, keyed by column name. */
export type ColumnEdits = Record<string, ColumnEdit>;

/** A column as the Columns tab shows it: the saved value under any unsaved change. */
export interface EditableColumn {
  name: string;
  role: RequestColumnMapping["role"];
  visible: boolean;
  scope: ColumnScope;
  caseResolution: CaseResolution;
  type: ExtraFieldType;
  changed: boolean;
  structural: boolean;
}

function saved(project: Project, column: RequestColumnMapping) {
  return {
    visible: !project.hiddenColumns.includes(column.name),
    scope: column.scope,
    caseResolution: column.scope === "case" ? column.caseResolution : ("constant" as const),
    type: inferExtraFieldType(column.type)
  };
}

export function editedColumns(project: Project, edits: ColumnEdits): EditableColumn[] {
  return project.columns.map((column) => {
    const before = saved(project, column);
    const after = { ...before, ...edits[column.name] };
    const structural =
      after.scope !== before.scope ||
      (after.scope === "case" && after.caseResolution !== before.caseResolution) ||
      after.type !== before.type;
    return {
      name: column.name,
      role: column.role,
      ...after,
      structural,
      changed: structural || after.visible !== before.visible
    };
  });
}

/**
 * The Column Mapping and hidden columns the edits amount to. A column whose type
 * was not edited keeps its exact declared type and timestamp pattern.
 */
export function savedColumns(
  project: Project,
  edits: ColumnEdits
): { columns: RequestColumnMapping[]; hiddenColumns: string[] } {
  const edited = editedColumns(project, edits);
  const columns = project.columns.map((column, index): RequestColumnMapping => {
    const next = edited[index];
    if (!next.structural) return column;
    const pattern =
      column.type === "date" || column.type === "datetime" ? column.timestampFormat : null;
    const type =
      next.type === inferExtraFieldType(column.type)
        ? column.type
        : extraFieldTypeToColumnType(next.type);
    return {
      name: column.name,
      role: column.role,
      ...scopingOf(next.scope, next.caseResolution),
      ...typingOf(type, pattern)
    };
  });
  const hiddenColumns = [
    ...project.hiddenColumns.filter((name) => !project.columns.some((c) => c.name === name)),
    ...edited.filter((column) => !column.visible).map((column) => column.name)
  ];
  return { columns, hiddenColumns };
}

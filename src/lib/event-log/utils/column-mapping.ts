import {
  CASE_RESOLUTIONS,
  COLUMN_ROLES,
  COLUMN_SCOPES,
  COLUMN_TYPES,
  type CaseResolution,
  type ColumnScope,
  type RequestColumnMapping,
  type ColumnRole,
  type ColumnType
} from "$lib/event-log/invokers/types";
import { isTemporal } from "$lib/event-log/utils/field-settings";

/**
 * Frontend-side validation of the column mapping payload before it is sent to
 * Rust or written to sqlite. The only validation boundary.
 */
export function validateColumnMapping(
  mapping: unknown,
  expectedColumnNames: string[]
): asserts mapping is RequestColumnMapping[] {
  if (!Array.isArray(mapping) || mapping.length === 0) {
    throw new Error("Column mapping must be a non-empty array.");
  }

  const seenNames = new Set<string>();
  let caseIdCount = 0;
  let activityCount = 0;
  let completeTimestampCount = 0;
  let startTimestampCount = 0;

  for (const entry of mapping) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Each column mapping entry must be an object.");
    }
    const { name, role, type, scope, caseResolution, timestampFormat } = entry as Record<
      string,
      unknown
    >;

    if (typeof name !== "string" || !expectedColumnNames.includes(name)) {
      throw new Error(`Column mapping references an unknown column: ${String(name)}`);
    }
    if (seenNames.has(name)) {
      throw new Error(`Column "${name}" is mapped more than once.`);
    }
    seenNames.add(name);

    if (typeof role !== "string" || !COLUMN_ROLES.includes(role as ColumnRole)) {
      throw new Error(`Column "${name}" has an invalid role: ${String(role)}`);
    }
    if (typeof type !== "string" || !COLUMN_TYPES.includes(type as ColumnType)) {
      throw new Error(`Column "${name}" has an invalid type: ${String(type)}`);
    }
    if (typeof scope !== "string" || !COLUMN_SCOPES.includes(scope as ColumnScope)) {
      throw new Error(`Column "${name}" has an invalid scope: ${String(scope)}`);
    }
    if (scope === "case") {
      if (
        typeof caseResolution !== "string" ||
        !CASE_RESOLUTIONS.includes(caseResolution as CaseResolution)
      ) {
        throw new Error(
          `Column "${name}" has an invalid case resolution: ${String(caseResolution)}`
        );
      }
    } else if (caseResolution !== undefined) {
      throw new Error(`Column "${name}" is event-scoped and cannot carry a case resolution.`);
    }

    if (isTemporal(type as ColumnType)) {
      if (timestampFormat !== null && (typeof timestampFormat !== "string" || !timestampFormat)) {
        throw new Error(`Column "${name}" has an invalid timestamp format.`);
      }
    } else if (timestampFormat !== undefined) {
      throw new Error(
        `Column "${name}" is declared ${String(type)} and cannot carry a timestamp format.`
      );
    }

    if (role === "case_id") caseIdCount++;
    if (role === "activity_name") activityCount++;
    if (role === "complete_timestamp") completeTimestampCount++;
    if (role === "start_timestamp") startTimestampCount++;
  }

  if (seenNames.size !== expectedColumnNames.length) {
    throw new Error("Column mapping must include every column from the event log.");
  }
  if (caseIdCount !== 1) throw new Error("Exactly one column must have the case_id role.");
  if (activityCount !== 1) throw new Error("Exactly one column must have the activity_name role.");
  if (completeTimestampCount !== 1) {
    throw new Error("Exactly one column must have the complete_timestamp role.");
  }
  if (startTimestampCount > 1) {
    throw new Error("At most one column can have the start_timestamp role.");
  }
}

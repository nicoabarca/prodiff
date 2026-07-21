export const COLUMN_ROLES = [
  "case_id",
  "activity_name",
  "complete_timestamp",
  "start_timestamp",
  "other"
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

// Must match (or translate cleanly from) a Rust/Polars dtype — see
// `dtype_label` in src-tauri/src/parsing/csv.rs, which is where this value
// actually originates for each column.
export const COLUMN_TYPES = ["string", "integer", "float", "boolean", "date", "datetime"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const COLUMN_GRANULARITIES = ["event", "case", "case_and_event"] as const;
export type ColumnGranularity = (typeof COLUMN_GRANULARITIES)[number];

export interface ColumnMapping {
  name: string;
  role: ColumnRole;
  type: ColumnType;
  granularity: ColumnGranularity;
}

/**
 * Frontend-side validation of the column mapping payload before it's sent to
 * Rust or written to sqlite. Local single-user app, so this doubles as the
 * only validation boundary (see docs/adr/0001).
 */
export function validateColumnMapping(
  mapping: unknown,
  expectedColumnNames: string[]
): asserts mapping is ColumnMapping[] {
  if (!Array.isArray(mapping) || mapping.length === 0) {
    throw new Error("Column mapping must be a non-empty array.");
  }

  const seenNames = new Set<string>();
  let caseIdCount = 0;
  let activityCount = 0;
  let completeTimestampCount = 0;

  for (const entry of mapping) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Each column mapping entry must be an object.");
    }
    const { name, role, type, granularity } = entry as Record<string, unknown>;

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
    if (
      typeof granularity !== "string" ||
      !COLUMN_GRANULARITIES.includes(granularity as ColumnGranularity)
    ) {
      throw new Error(`Column "${name}" has an invalid granularity: ${String(granularity)}`);
    }

    if (role === "case_id") caseIdCount++;
    if (role === "activity_name") activityCount++;
    if (role === "complete_timestamp") completeTimestampCount++;
  }

  if (seenNames.size !== expectedColumnNames.length) {
    throw new Error("Column mapping must include every column from the event log.");
  }
  if (caseIdCount !== 1) throw new Error("Exactly one column must have the case_id role.");
  if (activityCount !== 1) throw new Error("Exactly one column must have the activity_name role.");
  if (completeTimestampCount !== 1) {
    throw new Error("Exactly one column must have the complete_timestamp role.");
  }
}

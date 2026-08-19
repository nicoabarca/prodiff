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
  /**
   * The pattern the user confirmed for a temporal column, in the vocabulary
   * they were shown — `DD/MM/YYYY HH:mm`, not the Polars `%d/%m/%Y %H:%M`.
   * Rust translates it at the seam. Null means no format was declared, which
   * only happens for projects created before this field existed; those keep
   * falling back to whatever Polars makes of the text.
   */
  timestampFormat: string | null;
}

const TEMPORAL_TYPES: ColumnType[] = ["date", "datetime"];

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
  let startTimestampCount = 0;

  for (const entry of mapping) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Each column mapping entry must be an object.");
    }
    const { name, role, type, granularity, timestampFormat } = entry as Record<string, unknown>;

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

    if (timestampFormat !== null && timestampFormat !== undefined) {
      if (typeof timestampFormat !== "string" || timestampFormat.length === 0) {
        throw new Error(`Column "${name}" has an invalid timestamp format.`);
      }
      if (!TEMPORAL_TYPES.includes(type as ColumnType)) {
        throw new Error(
          `Column "${name}" carries a timestamp format but is declared ${String(type)}.`
        );
      }
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

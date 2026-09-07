import type { CaseResolution, ColumnScope, ColumnType } from "$lib/event-log/invokers/types";

export const EXTRA_FIELD_TYPES = ["string", "datetime", "number"] as const;
export type ExtraFieldType = (typeof EXTRA_FIELD_TYPES)[number];

export const EXTRA_FIELD_TYPE_LABELS: Record<ExtraFieldType, string> = {
  string: "String",
  datetime: "Datetime",
  number: "Number"
};

export const SCOPE_OPTIONS: ColumnScope[] = ["event", "case"];

export const SCOPE_LABELS: Record<ColumnScope, string> = {
  event: "Event",
  case: "Case"
};

export const SCOPE_DESCRIPTIONS: Record<ColumnScope, string> = {
  event: "The value belongs to the single event it sits on, such as the resource who performed it.",
  case: "The value belongs to the whole case, such as the customer segment or the region."
};

export const CASE_RESOLUTION_OPTIONS: CaseResolution[] = ["constant", "first", "last"];

export const CASE_RESOLUTION_LABELS: Record<CaseResolution, string> = {
  constant: "Constant",
  first: "First event",
  last: "Last event"
};

export const CASE_RESOLUTION_DESCRIPTIONS: Record<CaseResolution, string> = {
  constant: "Reads the one value each case holds across its events, ignoring empty ones.",
  first: "Reads the value on the earliest event of each case.",
  last: "Reads the value on the latest event of each case."
};

export function inferExtraFieldType(dtype: ColumnType): ExtraFieldType {
  switch (dtype) {
    case "integer":
    case "float":
      return "number";
    default:
      return "string";
  }
}

// Backend has no dedicated "number" dtype: floats cover both int- and
// float-shaped extra columns.
export function extraFieldTypeToColumnType(type: ExtraFieldType): ColumnType {
  return type === "number" ? "float" : type;
}

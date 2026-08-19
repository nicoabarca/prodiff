import type { ColumnGranularity, ColumnType } from "$lib/column-mapping";

export const EXTRA_FIELD_TYPES = ["string", "datetime", "number"] as const;
export type ExtraFieldType = (typeof EXTRA_FIELD_TYPES)[number];

export const EXTRA_FIELD_TYPE_LABELS: Record<ExtraFieldType, string> = {
  string: "String",
  datetime: "Datetime",
  number: "Number"
};

export const GRANULARITY_OPTIONS: ColumnGranularity[] = ["event", "case", "case_and_event"];

export const GRANULARITY_LABELS: Record<ColumnGranularity, string> = {
  event: "Event",
  case: "Case",
  case_and_event: "Case & Event"
};

export const GRANULARITY_DESCRIPTIONS: Record<ColumnGranularity, string> = {
  event: "The value can differ per event.",
  case: "The value is tracked at case level (e.g. region, customer).",
  case_and_event: "The value is tracked at both the case and event level."
};

// The preview never reports a temporal dtype — the CSV reader parses no dates,
// so a timestamp column arrives as text and lands on "String" here. Declaring
// it Datetime is the user's call, and it's the declaration that gives the
// column a timestamp format to parse with.
export function inferExtraFieldType(dtype: ColumnType): ExtraFieldType {
  switch (dtype) {
    case "integer":
    case "float":
      return "number";
    default:
      return "string";
  }
}

// Backend has no dedicated "number" dtype — floats cover both int- and
// float-shaped extra columns until a use for the distinction shows up.
export function extraFieldTypeToColumnType(type: ExtraFieldType): ColumnType {
  return type === "number" ? "float" : type;
}

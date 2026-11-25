import { isDurationAttribute } from "$lib/analysis/attributes";
import type { AttributeGranularity, AttributeRow } from "$lib/custom-attributes/types";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";

const GRANULARITY_ORDER: AttributeGranularity[] = ["case", "event", "derived"];

export const GRANULARITY_LABELS: Record<AttributeGranularity, string> = {
  case: "Case",
  event: "Event",
  derived: "Derived"
};

const TYPE_LABELS: Record<string, string> = {
  string: "Text",
  integer: "Integer",
  float: "Decimal",
  boolean: "Boolean",
  date: "Date",
  datetime: "Date and time"
};

/**
 * Each option as a picker row. An option with no column in `columns` is
 * derived: a duration, or a count the DFG takes. `columns` must hold the
 * Custom Attributes' columns too, so each one takes its own scope.
 */
export function attributeRows(options: string[], columns: RequestColumnMapping[]): AttributeRow[] {
  return options.map((name) => {
    const column = columns.find((c) => c.name === name);
    if (!column) {
      return {
        name,
        granularity: "derived",
        dataType: isDurationAttribute(name) ? "Time Duration" : "Count"
      };
    }
    return { name, granularity: column.scope, dataType: TYPE_LABELS[column.type] };
  });
}

/** The rows by granularity, in Case, Event, Derived order. Empty sections are left out. */
export function attributeSections(
  rows: AttributeRow[]
): { granularity: AttributeGranularity; rows: AttributeRow[] }[] {
  return GRANULARITY_ORDER.map((granularity) => ({
    granularity,
    rows: rows.filter((row) => row.granularity === granularity)
  })).filter((section) => section.rows.length > 0);
}

/** `selected` with every name in `names` added or removed. Other names keep their place. */
export function withNames(selected: string[], names: string[], on: boolean): string[] {
  const rest = selected.filter((name) => !names.includes(name));
  return on ? [...rest, ...names] : rest;
}

/**
 * The names from `from` to `to` in `order`, both included. If `from` is not in
 * `order`, only `to`.
 */
export function namesBetween(order: string[], from: string, to: string): string[] {
  const start = order.indexOf(from);
  const end = order.indexOf(to);
  if (start === -1 || end === -1) return [to];
  return order.slice(Math.min(start, end), Math.max(start, end) + 1);
}

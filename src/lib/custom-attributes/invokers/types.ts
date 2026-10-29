/**
 * The invocation contracts for the Custom Attribute commands. Every type here
 * mirrors a serde struct or enum in `src-tauri/src/custom_attributes/`.
 */

/** Whether an attribute holds one value per event or one per case. Fixed at creation. */
export type AttributeScope = "event" | "case";

export const AGGREGATE_FUNCTIONS = [
  "sum",
  "mean",
  "median",
  "min",
  "max",
  "first",
  "last"
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];

/** A parsed formula. Rust builds its Polars expression from this tree, never from text. */
export type Formula =
  | { kind: "column"; name: string }
  | { kind: "number"; value: number }
  | { kind: "negate"; operand: Formula }
  | { kind: "binary"; op: BinaryOperator; left: Formula; right: Formula }
  | { kind: "aggregate"; fn: AggregateFunction; column: string }
  | { kind: "count" }
  | { kind: "duration" };

export type BinaryOperator = "+" | "-" | "*" | "/";

/** An attribute to write: its id, its scope and its parsed formula. */
export interface RequestCustomAttribute {
  id: string;
  scope: AttributeScope;
  formula: Formula;
}

/**
 * How many values a written attribute left empty: events of the Event Log for
 * Event scope, cases for Case scope.
 */
export interface ResponseEmptyCount {
  id: string;
  empty: number;
}

/**
 * What a draft formula would compute over the whole Event Log. `total` counts
 * events for Event scope and cases for Case scope.
 */
export interface ResponseCustomAttributeImpact {
  total: number;
  empty: number;
}

/**
 * The invocation contracts for the Custom Attribute commands. Every type here
 * mirrors a serde struct or enum in `src-tauri/src/custom_attributes/`.
 */

/** A parsed formula. Rust builds its Polars expression from this tree, never from text. */
export type Formula =
  | { kind: "column"; name: string }
  | { kind: "number"; value: number }
  | { kind: "negate"; operand: Formula }
  | { kind: "binary"; op: BinaryOperator; left: Formula; right: Formula };

export type BinaryOperator = "+" | "-" | "*" | "/";

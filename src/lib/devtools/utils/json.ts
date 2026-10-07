import { isDurationAttribute } from "$lib/analysis/attributes";

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export type JsonKind = "object" | "array" | "string" | "number" | "boolean" | "null";

export function kindOf(value: unknown): JsonKind {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}

/** The children of an object or array as `[key, value]` pairs; empty for a primitive. */
export function childrenOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (kindOf(value) === "object") return Object.entries(value as Record<string, unknown>);
  return [];
}

/** What a collapsed branch shows in place of its children: `{3}`, `[44]`. */
export function branchPreview(value: unknown): string {
  const count = childrenOf(value).length;
  return kindOf(value) === "array" ? `[${count}]` : `{${count}}`;
}

/** A primitive as it would read in JSON: strings quoted, null spelled out. */
export function formatPrimitive(value: unknown): string {
  return kindOf(value) === "null" ? "null" : JSON.stringify(value);
}

/** The fields of a numerical `Summary` that carry the attribute's own unit. */
const VALUE_FIELDS = new Set([
  "mean",
  "std",
  "min",
  "q1",
  "median",
  "q3",
  "max",
  "whiskerLow",
  "whiskerHigh"
]);

/** The keys whose block holds durations whatever attribute map they sit in. */
const DURATION_BLOCKS = new Set(["transitionTime", "wait"]);

/**
 * Whether the value at `path` (keys from the inspected root down) is a duration
 * in milliseconds: a value field of a Transition Time block, of a DFG
 * transition's `wait`, or of a duration attribute's block under `eventLevel`
 * (the tree) or `attributes` (the DFG).
 */
export function isDurationPath(path: string[]): boolean {
  if (!VALUE_FIELDS.has(path[path.length - 1])) return false;
  return path.some(
    (key, index) =>
      DURATION_BLOCKS.has(key) ||
      ((key === "eventLevel" || key === "attributes") && isDurationAttribute(path[index + 1] ?? ""))
  );
}

/** The separator Rust joins a Variant's activities with in `variant_key`. */
const VARIANT_SEPARATOR = "\u0001";

/** A primitive for display: a `variantKey` reads as its activities in order. */
export function displayPrimitive(value: unknown, path: string[]): string {
  if (typeof value === "string" && path[path.length - 1] === "variantKey") {
    return value.split(VARIANT_SEPARATOR).join(" → ");
  }
  return formatPrimitive(value);
}

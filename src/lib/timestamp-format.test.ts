/**
 * A timestamp format that parses the wrong way round fails silently — the
 * import succeeds, every date is real, and only the ordering of the process is
 * quietly wrong. These tests pin the tokenizer and the parser that the mapping
 * step shows its evidence with. Run with
 * `npx tsx src/lib/timestamp-format.test.ts`.
 */
import assert from "node:assert/strict";
import { FORMAT_CATALOG, parseWithFormat, tokenize } from "./timestamp-format";

function parsed(value: string, pattern: string): string {
  const result = parseWithFormat(value, pattern);
  assert.ok(result.ok, `${value} should parse as ${pattern}`);
  return result.iso;
}

function rejected(value: string, pattern: string) {
  assert.equal(
    parseWithFormat(value, pattern).ok,
    false,
    `${value} should not parse as ${pattern}`
  );
}

// --- tokenizer -------------------------------------------------------------

{
  const pieces = tokenize("DD/MM/YYYY");
  assert.deepEqual(
    pieces.map((p) => (p.kind === "token" ? p.name : p.text)),
    ["DD", "/", "MM", "/", "YYYY"]
  );
}

{
  // Greedy, longest-first: YYYY must not come back as two YY.
  const pieces = tokenize("YYYY");
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].kind === "token" && pieces[0].name, "YYYY");
}

{
  const pieces = tokenize("%%YYYY");
  assert.equal(pieces[0].kind === "literal" && pieces[0].text, "%");
}

// --- round trips over the catalog -----------------------------------------

assert.equal(parsed("2024-01-15 09:30:00", "YYYY-MM-DD HH:mm:ss"), "2024-01-15 09:30:00");
assert.equal(parsed("2024-01-15T09:30:00", "YYYY-MM-DDTHH:mm:ss"), "2024-01-15 09:30:00");
assert.equal(parsed("2024-01-15", "YYYY-MM-DD"), "2024-01-15 00:00:00");
assert.equal(parsed("15/01/2024 09:30", "DD/MM/YYYY HH:mm"), "2024-01-15 09:30:00");
assert.equal(parsed("15.01.2024 09:30:00", "DD.MM.YYYY HH:mm:ss"), "2024-01-15 09:30:00");
assert.equal(parsed("1/1/2024 9:05", "D/M/YYYY H:mm"), "2024-01-01 09:05:00");

// Milliseconds survive, and show up in the value the user is shown back.
assert.equal(
  parsed("2024-01-15 09:30:00.250", "YYYY-MM-DD HH:mm:ss.SSS"),
  "2024-01-15 09:30:00.250"
);

// AM/PM, including the two hours that trip every naive implementation.
assert.equal(parsed("15/01/2024 01:30:00 PM", "DD/MM/YYYY hh:mm:ss A"), "2024-01-15 13:30:00");
assert.equal(parsed("15/01/2024 12:30:00 AM", "DD/MM/YYYY hh:mm:ss A"), "2024-01-15 00:30:00");
assert.equal(parsed("15/01/2024 12:30:00 PM", "DD/MM/YYYY hh:mm:ss A"), "2024-01-15 12:30:00");

// A zone suffix shifts the instant to UTC, matching what the import writes —
// the evidence line must not show a wall-clock reading the Parquet won't hold.
assert.equal(parsed("2024-01-15T09:30:00Z", "YYYY-MM-DDTHH:mm:ssZ"), "2024-01-15 09:30:00");
assert.equal(parsed("2024-01-15T09:30:00+03:00", "YYYY-MM-DDTHH:mm:ssZ"), "2024-01-15 06:30:00");
assert.equal(parsed("2024-01-15T09:30:00-0500", "YYYY-MM-DDTHH:mm:ssZ"), "2024-01-15 14:30:00");

// Every catalog entry has to be a pattern the parser itself accepts, or the
// select would offer something the evidence line can never confirm.
for (const pattern of FORMAT_CATALOG) {
  assert.ok(
    tokenize(pattern).some((p) => p.kind === "token"),
    `${pattern} has no tokens`
  );
}

// --- rejections ------------------------------------------------------------

// The whole value has to be consumed: a trailing time is not a bare date.
rejected("2024-01-15 09:30:00", "YYYY-MM-DD");
// Fixed-width tokens do not accept a short field.
rejected("2024-1-15", "YYYY-MM-DD");
// Literals have to match exactly.
rejected("15-01-2024", "DD/MM/YYYY");
// Field ranges are checked.
rejected("15/13/2024", "DD/MM/YYYY");
rejected("2024-01-15 25:00:00", "YYYY-MM-DD HH:mm:ss");
// A day that does not exist in that month is rejected rather than rolled over.
rejected("31/02/2024", "DD/MM/YYYY");
// 12-hour clock has no hour zero.
rejected("15/01/2024 00:30:00 AM", "DD/MM/YYYY hh:mm:ss A");
rejected("", "YYYY-MM-DD");
rejected("not a date", "YYYY-MM-DD");

// --- two-digit years -------------------------------------------------------

assert.equal(parsed("15/01/99", "DD/MM/YY"), "1999-01-15 00:00:00");
assert.equal(parsed("15/01/24", "DD/MM/YY"), "2024-01-15 00:00:00");

console.log("timestamp-format: all assertions passed");

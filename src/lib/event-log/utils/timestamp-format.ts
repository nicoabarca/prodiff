/**
 * Timestamp formats in the user's vocabulary.
 *
 * The app speaks `DD/MM/YYYY HH:mm:ss`; Polars speaks `%d/%m/%Y %H:%M:%S`. The
 * Column Mapping stores the former — it is what the user confirmed, and it is
 * what error messages have to quote back — and Rust translates it at the seam
 * (see `src-tauri/src/column_mapping/format.rs`). Nothing here produces a
 * Polars format string.
 *
 * This module also parses, because the field-mapping step has to show the user
 * what their pattern makes of a real value before anything is imported, and
 * that check has to run in the browser.
 */

/** A token, and how many digits it consumes when parsing. */
interface Token {
  /** Field it fills in. `era` is AM/PM, `offset` is a zone suffix. */
  field:
    | "year"
    | "month"
    | "day"
    | "hour24"
    | "hour12"
    | "minute"
    | "second"
    | "milli"
    | "era"
    | "offset";
  /** Fixed width, or null when the token accepts a variable number of digits. */
  width: number | null;
}

/**
 * Longest-first: the tokenizer matches greedily, so `YYYY` must be tried
 * before `YY`, otherwise it splits into two `YY` and the pattern silently
 * means something else.
 */
export const FORMAT_TOKENS: Record<string, Token> = {
  YYYY: { field: "year", width: 4 },
  YY: { field: "year", width: 2 },
  MM: { field: "month", width: 2 },
  M: { field: "month", width: null },
  DD: { field: "day", width: 2 },
  D: { field: "day", width: null },
  HH: { field: "hour24", width: 2 },
  H: { field: "hour24", width: null },
  hh: { field: "hour12", width: 2 },
  h: { field: "hour12", width: null },
  mm: { field: "minute", width: 2 },
  ss: { field: "second", width: 2 },
  SSS: { field: "milli", width: 3 },
  A: { field: "era", width: 0 },
  Z: { field: "offset", width: 0 }
};

const TOKEN_NAMES = Object.keys(FORMAT_TOKENS).sort((a, b) => b.length - a.length);

/** One piece of a tokenized pattern: a token to parse, or text to match as-is. */
export type Piece =
  { kind: "token"; name: string; token: Token } | { kind: "literal"; text: string };

/**
 * Splits a pattern into tokens and literals. Anything that is not a token is a
 * literal and has to appear verbatim in the value; `%` is escaped as `%%` so a
 * pattern can contain one without it reading as a Polars directive downstream.
 */
export function tokenize(pattern: string): Piece[] {
  const pieces: Piece[] = [];
  let literal = "";
  let i = 0;

  const flush = () => {
    if (literal) {
      pieces.push({ kind: "literal", text: literal });
      literal = "";
    }
  };

  while (i < pattern.length) {
    if (pattern.startsWith("%%", i)) {
      literal += "%";
      i += 2;
      continue;
    }
    const name = TOKEN_NAMES.find((t) => pattern.startsWith(t, i));
    if (name) {
      flush();
      pieces.push({ kind: "token", name, token: FORMAT_TOKENS[name] });
      i += name.length;
      continue;
    }
    literal += pattern[i];
    i += 1;
  }
  flush();
  return pieces;
}

/** The catalog, in priority order — earlier patterns win an ambiguous sample. */
export const FORMAT_CATALOG: string[] = [
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DDTHH:mm:ss",
  "YYYY-MM-DD HH:mm:ss.SSS",
  "YYYY-MM-DDTHH:mm:ss.SSS",
  "YYYY-MM-DDTHH:mm:ssZ",
  "YYYY-MM-DD",
  "DD/MM/YYYY HH:mm:ss",
  "DD/MM/YYYY HH:mm",
  "DD/MM/YYYY",
  "DD-MM-YYYY HH:mm:ss",
  "MM/DD/YYYY HH:mm:ss",
  "MM/DD/YYYY",
  "DD.MM.YYYY HH:mm:ss",
  "YYYY/MM/DD HH:mm:ss",
  "DD/MM/YYYY hh:mm:ss A",
  "MM/DD/YYYY hh:mm:ss A"
];

const DIGITS = /[0-9]/;

function readDigits(value: string, at: number, width: number | null): [string, number] | null {
  let end = at;
  const limit = width === null ? value.length : Math.min(at + width, value.length);
  while (end < limit && DIGITS.test(value[end])) end += 1;
  if (end === at) return null;
  if (width !== null && end - at !== width) return null;
  return [value.slice(at, end), end];
}

/** What a pattern made of a value: the UTC instant, or why it failed. */
export type ParseResult = { ok: true; date: Date; iso: string } | { ok: false };

/**
 * Applies a pattern to one value. Strict in the same way the import is: the
 * whole value has to be consumed, field widths have to match, and the numbers
 * have to describe a real instant — `31/02/2024` parses digit-wise and is still
 * rejected, because Rust will reject it too.
 */
export function parseWithFormat(value: string, pattern: string): ParseResult {
  const pieces = tokenize(pattern);
  const parts: Record<string, string> = {};
  let at = 0;

  for (const piece of pieces) {
    if (piece.kind === "literal") {
      if (!value.startsWith(piece.text, at)) return { ok: false };
      at += piece.text.length;
      continue;
    }
    const { field, width } = piece.token;

    if (field === "era") {
      const era = value.slice(at, at + 2).toUpperCase();
      if (era !== "AM" && era !== "PM") return { ok: false };
      parts.era = era;
      at += 2;
      continue;
    }
    if (field === "offset") {
      // `Z` literally, or a ±HH:MM / ±HHMM suffix.
      if (value[at] === "Z") {
        parts.offset = "Z";
        at += 1;
        continue;
      }
      const match = /^[+-][0-9]{2}:?[0-9]{2}/.exec(value.slice(at));
      if (!match) return { ok: false };
      parts.offset = match[0];
      at += match[0].length;
      continue;
    }

    const read = readDigits(value, at, width);
    if (!read) return { ok: false };
    parts[field] = read[0];
    at = read[1];
  }

  if (at !== value.length) return { ok: false };

  const year = parts.year === undefined ? 1970 : normalizeYear(parts.year);
  const month = parts.month === undefined ? 1 : Number(parts.month);
  const day = parts.day === undefined ? 1 : Number(parts.day);
  const minute = parts.minute === undefined ? 0 : Number(parts.minute);
  const second = parts.second === undefined ? 0 : Number(parts.second);
  const milli = parts.milli === undefined ? 0 : Number(parts.milli);
  const hour = resolveHour(parts);
  if (hour === null) return { ok: false };

  if (month < 1 || month > 12) return { ok: false };
  if (day < 1 || day > 31) return { ok: false };
  if (hour > 23 || minute > 59 || second > 59) return { ok: false };

  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milli));
  // Rolls over on an impossible calendar day (Feb 31 becomes Mar 2), which is a
  // mismatch the user needs to see rather than a value to accept.
  if (local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return { ok: false };

  // A zone suffix shifts the instant, exactly as Polars' `%z` does. Showing the
  // wall-clock reading instead would put a different time on screen than the one
  // the import writes, which is the whole failure this step exists to prevent.
  const date = new Date(local.getTime() - offsetMinutes(parts.offset) * 60_000);

  return { ok: true, date, iso: formatIso(date, parts.milli !== undefined) };
}

/** Minutes east of UTC carried by a `Z` token; absent or literal `Z` is zero. */
function offsetMinutes(raw: string | undefined): number {
  if (raw === undefined || raw === "Z") return 0;
  const match = /^([+-])([0-9]{2}):?([0-9]{2})$/.exec(raw);
  if (!match) return 0;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

/** Two-digit years follow the POSIX split: 69–99 are 1900s, 00–68 are 2000s. */
function normalizeYear(raw: string): number {
  const n = Number(raw);
  if (raw.length !== 2) return n;
  return n >= 69 ? 1900 + n : 2000 + n;
}

function resolveHour(parts: Record<string, string>): number | null {
  if (parts.hour24 !== undefined) return Number(parts.hour24);
  if (parts.hour12 === undefined) return 0;
  const twelve = Number(parts.hour12);
  if (twelve < 1 || twelve > 12) return null;
  if (parts.era === undefined) return twelve;
  if (parts.era === "AM") return twelve === 12 ? 0 : twelve;
  return twelve === 12 ? 12 : twelve + 12;
}

/** How a parsed value is shown back to the user: canonical, unambiguous. */
function formatIso(date: Date, withMillis: boolean): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const base =
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return withMillis ? `${base}.${pad(date.getUTCMilliseconds(), 3)}` : base;
}

/** What inference made of one column's sample values. */
export interface FormatInference {
  /** The winning pattern, or null when nothing in the catalog parsed the sample. */
  pattern: string | null;
  /**
   * Catalog patterns that also parsed every value. The winner is catalog order,
   * which is a guess whenever this is non-empty — `05/03/2024` reads as both
   * `DD/MM/YYYY` and `MM/DD/YYYY`, and only a day past the 12th in the sample
   * tells them apart. The mapping step warns when this is non-empty rather than
   * letting the guess pass silently.
   */
  rivals: string[];
  /** Values the winning pattern parsed, out of the non-empty ones considered. */
  matched: number;
  total: number;
  /** First value the winning pattern could not read, for the evidence line. */
  firstFailure: { value: string; row: number } | null;
}

/** Counts how many of `values` a pattern reads, and where it first gives up. */
export function coverage(
  values: string[],
  pattern: string
): { matched: number; total: number; firstFailure: { value: string; row: number } | null } {
  let matched = 0;
  let total = 0;
  let firstFailure: { value: string; row: number } | null = null;

  values.forEach((value, row) => {
    // Empty cells are missing data, not a format mismatch — Polars nulls them
    // rather than failing the import, so they must not count against a pattern.
    if (value.trim() === "") return;
    total += 1;
    if (parseWithFormat(value, pattern).ok) {
      matched += 1;
    } else if (!firstFailure) {
      firstFailure = { value, row };
    }
  });

  return { matched, total, firstFailure };
}

/**
 * Picks the format for a column from its sample values. A pattern wins only by
 * reading *every* non-empty value — a partial match is how a European log gets
 * silently read as American, so nothing short of full coverage counts.
 *
 * Ties are kept rather than resolved: `pattern` is catalog order, `rivals` is
 * everything else that also matched in full, and the mapping step surfaces
 * them. When nothing matches in full, the column has no inferred format and
 * the interface opens on Custom.
 */
export function inferFormat(values: string[], catalog: string[] = FORMAT_CATALOG): FormatInference {
  const full = catalog.filter((pattern) => {
    const { matched, total } = coverage(values, pattern);
    return total > 0 && matched === total;
  });

  const pattern = full[0] ?? null;
  const stats =
    pattern === null
      ? { matched: 0, total: coverage(values, FORMAT_CATALOG[0]).total, firstFailure: null }
      : coverage(values, pattern);

  return { pattern, rivals: full.slice(1), ...stats };
}

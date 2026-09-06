/** User-facing timestamp patterns and browser preview parsing. */

interface Token {
  field:
    | "year"
    | "month"
    | "day"
    | "hour24"
    | "hour12"
    | "minute"
    | "second"
    | "milli"
    | "micro"
    | "era"
    | "offset";
  width: number | null;
}

const FORMAT_TOKENS: Record<string, Token> = {
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
  SSSSSS: { field: "micro", width: 6 },
  A: { field: "era", width: 0 },
  Z: { field: "offset", width: 0 }
};

const TOKEN_NAMES = Object.keys(FORMAT_TOKENS).sort((a, b) => b.length - a.length);

export type Piece =
  { kind: "token"; name: string; token: Token } | { kind: "literal"; text: string };

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

/** Earlier patterns win ambiguous samples. */
export const FORMAT_CATALOG: string[] = [
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DDTHH:mm:ss",
  "YYYY-MM-DD HH:mm:ss.SSS",
  "YYYY-MM-DDTHH:mm:ss.SSS",
  "YYYY-MM-DD HH:mm:ss.SSSSSS",
  "YYYY-MM-DD HH:mm:ss.SSSSSSZ",
  "YYYY-MM-DDTHH:mm:ss.SSSSSS",
  "YYYY-MM-DDTHH:mm:ss.SSSSSSZ",
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

function readDigits(
  value: string,
  at: number,
  width: number | null,
  min: number
): [string, number] | null {
  let end = at;
  const limit = width === null ? value.length : Math.min(at + width, value.length);
  while (end < limit && DIGITS.test(value[end])) end += 1;
  if (end - at < min) return null;
  return [value.slice(at, end), end];
}

export type ParseResult = { ok: true; date: Date; iso: string } | { ok: false };

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
      if (value[at] === "Z") {
        parts.offset = "Z";
        at += 1;
        continue;
      }
      const match = /^[+-][0-9]{2}:?[0-9]{2}/.exec(value.slice(at));
      if (!match) return { ok: false };
      const digits = match[0].replace(":", "").slice(1);
      if (Number(digits.slice(0, 2)) > 23 || Number(digits.slice(2)) > 59) {
        return { ok: false };
      }
      parts.offset = match[0];
      at += match[0].length;
      continue;
    }

    const exact = field === "milli" || field === "micro";
    const read = readDigits(value, at, width, exact && width !== null ? width : 1);
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
  const fraction = parts.milli ?? parts.micro?.slice(0, 3);
  const milli = fraction === undefined ? 0 : Number(fraction);
  const hour = resolveHour(parts);
  if (hour === null) return { ok: false };

  if (month < 1 || month > 12) return { ok: false };
  if (day < 1 || day > 31) return { ok: false };
  if (hour > 23 || minute > 59 || second > 59) return { ok: false };

  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milli));
  if (local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return { ok: false };

  const date = new Date(local.getTime() - offsetMinutes(parts.offset) * 60_000);

  return { ok: true, date, iso: formatIso(date, fraction !== undefined) };
}

function offsetMinutes(raw: string | undefined): number {
  if (raw === undefined || raw === "Z") return 0;
  const match = /^([+-])([0-9]{2}):?([0-9]{2})$/.exec(raw);
  if (!match) return 0;
  const magnitude = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -magnitude : magnitude;
}

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

function formatIso(date: Date, withMillis: boolean): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const base =
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return withMillis ? `${base}.${pad(date.getUTCMilliseconds(), 3)}` : base;
}

export interface FormatInference {
  pattern: string | null;
  rivals: string[];
}

export function coverage(values: string[], pattern: string): { matched: number; total: number } {
  let matched = 0;
  let total = 0;

  values.forEach((value) => {
    if (value.trim() === "") return;
    total += 1;
    if (parseWithFormat(value, pattern).ok) matched += 1;
  });

  return { matched, total };
}

export function inferFormat(values: string[], catalog: string[] = FORMAT_CATALOG): FormatInference {
  const full = catalog.filter((pattern) => {
    const { matched, total } = coverage(values, pattern);
    return total > 0 && matched === total;
  });

  return { pattern: full[0] ?? null, rivals: full.slice(1) };
}

/** Display formatting for the figures the analysis views show. */

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function formatDecimal(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

const DURATION_UNITS = [
  ["d", 86_400],
  ["h", 3_600],
  ["m", 60],
  ["s", 1]
] as const;

/**
 * A duration in milliseconds as its two largest non-zero units ("8d 4h"), which
 * is as much precision as a case duration is ever read at. `null` — a Group
 * with no cases — renders as an em dash.
 */
export function formatDuration(millis: number | null): string {
  if (millis === null) return "—";

  let remaining = Math.round(millis / 1000);
  const parts: string[] = [];
  for (const [label, size] of DURATION_UNITS) {
    const value = Math.floor(remaining / size);
    remaining -= value * size;
    if (value > 0 || parts.length > 0) parts.push(`${value}${label}`);
    if (parts.length === 2) break;
  }
  return parts.length > 0 ? parts.join(" ") : "0s";
}

/**
 * Every non-zero unit of a duration ("1d 2h 30m 15s") — what `formatDuration`
 * trims away matters when the text is meant to be edited and read back.
 */
export function formatDurationParts(millis: number): string {
  let remaining = Math.round(millis / 1000);
  const parts: string[] = [];
  for (const [label, size] of DURATION_UNITS) {
    const value = Math.floor(remaining / size);
    remaining -= value * size;
    if (value > 0 || parts.length > 0) parts.push(`${value}${label}`);
  }
  return parts.length > 0 ? parts.join(" ") : "0s";
}

/**
 * A day as the log writes it. Read in UTC deliberately: event timestamps carry
 * no zone, so a local reading would move a midnight event to the day before.
 */
export function formatDay(millis: number): string {
  return new Date(millis).toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

/** A Group's stored colour token as a usable CSS colour. */
export function colorVar(token: string): string {
  return `var(--${token})`;
}

/**
 * A washed-out version of a Group's colour, for tinting the column that belongs
 * to it. The Original tints grey, its own accent, so the filtered Groups read
 * as the ones being compared.
 */
export function colorTint(token: string, percent = 7): string {
  if (token === "foreground") return "transparent";
  return `color-mix(in oklab, var(--${token}) ${percent}%, transparent)`;
}

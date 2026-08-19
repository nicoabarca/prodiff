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
 * is as much precision as a case duration is ever read at. `null` — a
 * population with no cases — renders as an em dash.
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

/** A slice's stored colour token as a usable CSS colour. */
export function colorVar(token: string): string {
  return `var(--${token})`;
}

/**
 * A colour token's Tailwind classes, written out in full rather than built as
 * `text-${token}`: Tailwind scans the source for literal class names, so a
 * class assembled at runtime is never generated.
 */
const TEXT_CLASS: Record<string, string> = {
  "slice-1": "text-slice-1",
  "slice-2": "text-slice-2",
  "slice-base": "text-slice-base"
};

const BG_CLASS: Record<string, string> = {
  "slice-1": "bg-slice-1",
  "slice-2": "bg-slice-2",
  "slice-base": "bg-slice-base"
};

export function textClass(token: string): string {
  return TEXT_CLASS[token] ?? "text-foreground";
}

export function bgClass(token: string): string {
  return BG_CLASS[token] ?? "bg-foreground";
}

/**
 * A washed-out version of a population's colour, for tinting the column that
 * belongs to it. The whole log is left untinted so the filtered populations
 * read as the ones being compared; Base tints grey, its own accent.
 */
export function colorTint(token: string, percent = 7): string {
  if (token === "foreground") return "transparent";
  return `color-mix(in oklab, var(--${token}) ${percent}%, transparent)`;
}

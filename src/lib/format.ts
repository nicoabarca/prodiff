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

/** A duration in milliseconds as its two largest non-zero units ("8d 4h"). */
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

/** Every non-zero unit of a duration ("1d 2h 30m 15s"), for text meant to be edited. */
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

/** A day as the log writes it. Read in UTC: event timestamps carry no zone. */
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

/** A washed-out version of a Group's colour, for tinting its column. */
export function colorTint(token: string, percent = 7): string {
  if (token === "foreground") return "transparent";
  return `color-mix(in oklab, var(--${token}) ${percent}%, transparent)`;
}

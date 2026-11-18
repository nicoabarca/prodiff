/** Display formatting for the figures the analysis views show. */

export function formatNumber(value: number): string {
  return value.toLocaleString();
}

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1
});

/** A count with a K, M or B suffix and one decimal at most ("10.6K"); below 1,000 it reads in full. */
export function formatCompact(value: number): string {
  return compact.format(value);
}

/** A size in bytes in the largest unit that keeps it above one ("1.9 MB"). */
export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)) - 1, units.length - 1);
  return `${(size / 1024 ** (unit + 1)).toLocaleString(undefined, {
    maximumFractionDigits: 1
  })} ${units[unit]}`;
}

/** A share from 0 to 1 as a percentage with one decimal ("16.5%"). */
export function formatPercent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
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

/** A duration in milliseconds as its two largest non-zero units. */
export function formatDuration(millis: number | null): string {
  if (millis === null) return "—";
  return durationParts(millis, 2);
}

/** Every non-zero unit of a duration ("1d 2h 30m 15s"). */
export function formatDurationParts(millis: number): string {
  return durationParts(millis, DURATION_UNITS.length);
}

function durationParts(millis: number, limit: number): string {
  let remaining = Math.round(Math.abs(millis) / 1000);
  const parts: string[] = [];
  for (const [label, size] of DURATION_UNITS) {
    const value = Math.floor(remaining / size);
    remaining -= value * size;
    if (value > 0 || parts.length > 0) parts.push(`${value}${label}`);
    if (parts.length === limit) break;
  }
  if (parts.length === 0) return "0s";
  return `${millis < 0 ? "-" : ""}${parts.join(" ")}`;
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

/**
 * A chart tick label cut to `max` characters, ending in an ellipsis. SVG text
 * cannot show a tooltip of its own, so the chart's tooltip must carry the whole text.
 */
export function tickLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

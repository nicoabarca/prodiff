/** A count shortened past ten thousand ("41.4k", "1.20M"). */
export function shortCount(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e4) return `${(value / 1e3).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** When a Project was opened, relative to `now`: "today", "yesterday", "Sep 24" or "Sep 24, 2025". */
export function openedLabel(iso: string, now = new Date()): string {
  const opened = new Date(iso);
  if (sameDay(opened, now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(opened, yesterday)) return "yesterday";
  return opened.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(opened.getFullYear() === now.getFullYear() ? {} : { year: "numeric" })
  });
}

/** A month as the timespan shows it ("Jan 2016"). */
export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

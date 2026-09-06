import type { ResponseTimestampColumnReport } from "$lib/event-log/invokers/types";
import type { FormatCheck } from "$lib/event-log/types";

/** Narrows a full-file report down to the one pattern the column is set to. */
export function checkFromReport(
  report: ResponseTimestampColumnReport,
  pattern: string
): FormatCheck {
  const coverage = report.coverage.find((c) => c.pattern === pattern);
  return {
    pattern,
    rows: report.rows,
    nulls: report.nulls,
    failed: coverage?.failed ?? Math.max(report.rows - report.nulls, 0),
    sample: report.deviants[0]?.value ?? null
  };
}

/** Rows the pattern read: everything that was neither empty nor unreadable. */
export function matchedRows(check: FormatCheck): number {
  return Math.max(check.rows - check.nulls - check.failed, 0);
}

/**
 * Whether a temporal column still has no pattern worth importing with: none
 * picked, or one the file gives nothing to. A pattern awaiting its first check
 * counts as resolved, since the sample is what seeded it.
 */
export function patternUnresolved(pattern: string, check: FormatCheck | undefined): boolean {
  if (pattern.trim() === "") return true;
  return check !== undefined && matchedRows(check) === 0;
}

export function formatCheckMessage(column: string, check: FormatCheck): string {
  const rows = check.failed === 1 ? "row" : "rows";
  return `${check.failed.toLocaleString()} ${rows} in ${column} do not match ${check.pattern}`;
}

/** `total` adds the row count the other figures are over. */
export function formatCheckDetail(check: FormatCheck, options?: { total?: boolean }): string {
  const parts: string[] = [];
  if (options?.total) parts.push(`${check.rows.toLocaleString()} rows read`);
  if (check.nulls > 0) parts.push(`${check.nulls.toLocaleString()} empty`);
  if (check.sample) parts.push(`first mismatch: ${check.sample}`);
  return parts.join(" · ");
}

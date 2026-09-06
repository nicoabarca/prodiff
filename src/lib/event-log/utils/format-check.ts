import type { ResponseTimestampColumnReport } from "$lib/event-log/invokers/types";
import type { FormatCheck } from "$lib/event-log/types";

export function checkFromReport(
  report: ResponseTimestampColumnReport,
  pattern: string
): FormatCheck {
  const coverage = report.coverage.find((c) => c.pattern === pattern);
  return {
    pattern,
    rows: report.rows,
    missing: report.missing,
    failed: coverage?.failed ?? Math.max(report.rows - report.missing, 0),
    sample: report.deviants[0] ?? null
  };
}

export function matchedRows(check: FormatCheck): number {
  return Math.max(check.rows - check.missing - check.failed, 0);
}

export function patternUnresolved(pattern: string, check: FormatCheck | undefined): boolean {
  if (pattern.trim() === "") return true;
  return !check || check.pattern !== pattern || matchedRows(check) === 0;
}

export function formatCheckMessage(column: string, check: FormatCheck): string {
  const rows = check.failed === 1 ? "row" : "rows";
  return `${check.failed.toLocaleString()} ${rows} in ${column} do not match ${check.pattern}`;
}

export function formatCheckDetail(check: FormatCheck, options?: { total?: boolean }): string {
  const parts: string[] = [];
  if (options?.total) parts.push(`${check.rows.toLocaleString()} rows read`);
  if (check.missing > 0) parts.push(`${check.missing.toLocaleString()} empty`);
  if (check.sample) parts.push(`first mismatch: ${check.sample}`);
  return parts.join(" · ");
}

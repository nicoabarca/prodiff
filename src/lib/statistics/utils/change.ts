/** A difference this big, in percent or percentage points, is called a gap. */
export const GAP = 5;

/** B against A in percent, or null when A is zero and no ratio exists. */
export function percentChange(a: number, b: number): number | null {
  if (a === 0) return b === 0 ? 0 : null;
  return ((b - a) / Math.abs(a)) * 100;
}

/** A share in percent, 0 when there is nothing to divide. */
export function share(count: number, total: number): number {
  return total === 0 ? 0 : (count / total) * 100;
}

/** A signed difference with a true minus, or an em dash when it rounds to nothing. */
export function formatSigned(value: number | null, digits = 1, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.5 * 10 ** -digits) return "—";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}${suffix}`;
}

export function isGap(value: number | null): boolean {
  return value !== null && Math.abs(value) >= GAP;
}

/** Cramér's V or rank-biserial r in words, by the usual cut points. */
export function effectLabel(size: number): string {
  if (size < 0.1) return "negligible";
  if (size < 0.3) return "small";
  if (size < 0.5) return "moderate";
  return "large";
}

/** A p-value as the tables print it. */
export function formatP(p: number): string {
  return p < 0.001 ? "< 0.001" : `= ${p.toFixed(3)}`;
}

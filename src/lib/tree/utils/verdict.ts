/**
 * One attribute's comparison said in a line of words: the headline its chart
 * leads with, the verdict its Significance Test reaches, and the test itself.
 */
import type { AttributeBlock, Summary, Test } from "$lib/analysis/types";
import type { Group } from "$lib/groups/types";
import { formatDecimal, formatDuration } from "$lib/format";

type Named = Pick<Group, "id" | "name">;

/** A figure in the attribute's own unit: milliseconds for durations. */
export function formatValue(value: number, duration: boolean): string {
  return duration ? formatDuration(value) : formatDecimal(value, Math.abs(value) < 10 ? 2 : 0);
}

export function formatPValue(p: number): string {
  return p < 0.001 ? p.toExponential(1) : p.toFixed(3);
}

/** The Group a test names as higher, by the name the user gave it. */
export function higherGroup<T extends Named>(test: Test | null, groups: T[]): T | null {
  if (!test?.higher) return null;
  return groups.find((group) => group.id === test.higher) ?? null;
}

/** The Significance Test in full, for a tooltip or a footnote. */
export function testLine(test: Test, groups: Named[]): string {
  const name = test.test === "chi2" ? "Chi-square" : "Mann-Whitney U";
  const effect = test.test === "chi2" ? "Cramér's V" : "rank-biserial r";
  const higher = higherGroup(test, groups);
  const direction = higher ? ` · ${higher.name} higher` : "";
  return `${name} · p = ${formatPValue(test.pValue)}, corrected for the number of attributes tested · ${effect} ${test.effectSize.toFixed(2)}${direction}`;
}

function numeric(summary: Summary | null | undefined) {
  return summary?.type === "numerical" ? summary : null;
}

/** The median gap between the first and last Group, or `null` when either is not numeric. */
function medianGap(summaries: Record<string, Summary | null>, groups: Named[]) {
  if (groups.length < 2) return null;
  const from = numeric(summaries[groups[0].id]);
  const to = numeric(summaries[groups[groups.length - 1].id]);
  if (!from || !to) return null;
  return to.median - from.median;
}

/** The category whose share moves most between the Groups, in percentage points. */
function topCategory(summaries: Record<string, Summary | null>, groups: Named[]) {
  const counts = groups.map((group) => {
    const summary = summaries[group.id];
    return summary?.type === "categorical" ? summary.counts : {};
  });
  const totals = counts.map((c) => Object.values(c).reduce((sum, n) => sum + n, 0) || 1);
  const names = [...new Set(counts.flatMap((c) => Object.keys(c)))];
  if (names.length === 0) return null;
  const shares = names.map((name) => {
    const share = counts.map((c, i) => ((c[name] ?? 0) / totals[i]) * 100);
    return {
      name,
      share: share[0],
      gap: share.length > 1 ? share[share.length - 1] - share[0] : 0
    };
  });
  const key =
    groups.length > 1
      ? (s: (typeof shares)[number]) => Math.abs(s.gap)
      : (s: (typeof shares)[number]) => s.share;
  return shares.reduce((best, s) => (key(s) > key(best) ? s : best));
}

function signed(gap: number): string {
  const sign = Math.abs(gap) < 0.05 ? "" : gap > 0 ? "+" : "−";
  return `${sign}${Math.abs(gap).toFixed(1)} pp`;
}

/**
 * What an attribute's chart shows first, in a few words: the median gap for a
 * number, the category that moves most for a category. With one Group, its
 * median or its commonest value.
 */
export function headline(
  summaries: Record<string, Summary | null>,
  groups: Named[],
  duration: boolean
): string {
  if (groups.length === 0) return "";
  const first = numeric(summaries[groups[0].id]);
  if (groups.length === 1) {
    if (first) return `median ${formatValue(first.median, duration)}`;
    const top = topCategory(summaries, groups);
    return top ? `${top.name} ${top.share.toFixed(0)}%` : "";
  }
  const gap = medianGap(summaries, groups);
  if (gap !== null) {
    if (gap === 0) return "same median";
    const leader = gap > 0 ? groups[groups.length - 1] : groups[0];
    return `${leader.name} +${formatValue(Math.abs(gap), duration)} median`;
  }
  const top = topCategory(summaries, groups);
  return top ? `${top.name} ${signed(top.gap)}` : "";
}

/** Why a block carries no Significance Test, in the user's terms. */
export function untestable(block: AttributeBlock, groups: Named[]): string {
  if (groups.length < 2) return "One-group mode: nothing to compare against.";
  const counted = groups.map((group) => ({
    name: group.name,
    n: block.summaries[group.id]?.n ?? 0
  }));
  if (counted.some((group) => group.n < 5)) {
    const listed = counted.map((group) => `${group.name}: ${group.n}`).join(", ");
    return `Too few cases to test. ${listed} (minimum 5 each).`;
  }
  return "Not enough distinct values to compare.";
}

/** The Significance Test's outcome in one short line, for a collapsed row. */
export function verdict(block: AttributeBlock, groups: Named[], duration: boolean): string {
  const test = block.test;
  if (!test)
    return groups.length < 2
      ? headline(block.summaries, groups, duration)
      : "Too few cases to test";
  if (!test.significant) return `p = ${formatPValue(test.pValue)} · not significant`;
  const higher = higherGroup(test, groups);
  const word = duration ? "longer" : "higher";
  if (higher) {
    const gap = medianGap(block.summaries, groups);
    return gap
      ? `${higher.name} ${word} by ${formatValue(Math.abs(gap), duration)} at median`
      : `${higher.name} ${word}`;
  }
  return `Different mix · ${headline(block.summaries, groups, duration)}`;
}

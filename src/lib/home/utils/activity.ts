import type { ResponseDayLoad } from "$lib/filters/invokers/types";

/**
 * Daily open-case counts folded into at most `bins` bars, each the mean of its
 * days as a percentage of the tallest bar. A bar with any load keeps a sliver
 * so it stays visible; an empty one is 0.
 */
export function activityBars(days: ResponseDayLoad[], bins = 48): number[] {
  if (days.length === 0) return [];
  const count = Math.min(bins, days.length);
  const means = Array.from({ length: count }, (_, bin) => {
    const start = Math.floor((bin * days.length) / count);
    const end = Math.floor(((bin + 1) * days.length) / count);
    const slice = days.slice(start, end);
    return slice.reduce((sum, day) => sum + day.cases, 0) / slice.length;
  });
  const max = Math.max(...means);
  if (max === 0) return means.map(() => 0);
  return means.map((mean) => (mean === 0 ? 0 : Math.max(6, Math.round((mean / max) * 100))));
}

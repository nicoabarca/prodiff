import type { BoxStats } from "$lib/analysis/types";

export type BoxRow = { id: string; name: string; color: string } & BoxStats;

export interface OutlierLabel {
  text: string;
  tooltip: string;
}

/** The rows of a box plot in Group order. A Group without a box has no row. */
export function boxRows(
  groups: { id: string; name: string; color: string }[],
  boxes: Record<string, BoxStats | null | undefined>
): BoxRow[] {
  return groups.flatMap((group) => {
    const box = boxes[group.id];
    return box ? [{ id: group.id, name: group.name, color: group.color, ...box }] : [];
  });
}

/** From the lowest lower whisker to the highest upper whisker. */
export function whiskerDomain(rows: BoxStats[]): [number, number] {
  return [
    Math.min(...rows.map((row) => row.whiskerLow)),
    Math.max(...rows.map((row) => row.whiskerHigh))
  ];
}

/** From the smallest value to the largest, outliers included. */
export function fullDomain(rows: BoxStats[]): [number, number] {
  return [Math.min(...rows.map((row) => row.min)), Math.max(...rows.map((row) => row.max))];
}

/**
 * Where the symlog scale stops being linear: `constant` when it is positive,
 * else the widest IQR, else an eighth of the domain.
 */
export function symlogConstant(
  rows: BoxStats[],
  low: number,
  high: number,
  constant?: number
): number {
  if (constant !== undefined && constant > 0) return constant;
  const widest = Math.max(...rows.map((row) => row.q3 - row.q1), 0);
  return widest > 0 ? widest : Math.max((high - low) / 8, Number.MIN_VALUE);
}

/** The label at each whisker end that has outliers past it, `null` on a side with none. */
export function outlierLabels(
  box: BoxStats,
  format: (value: number) => string,
  formatCount: (value: number) => string
): { high: OutlierLabel | null; low: OutlierLabel | null } {
  const values = (count: number) => (count === 1 ? "value" : "values");
  return {
    high:
      box.outliersHigh > 0
        ? {
            text: `+${formatCount(box.outliersHigh)} · ${format(box.max)}`,
            tooltip: `${formatCount(box.outliersHigh)} ${values(box.outliersHigh)} above ${format(box.whiskerHigh)}, max is ${format(box.max)}`
          }
        : null,
    low:
      box.outliersLow > 0
        ? {
            text: `${format(box.min)} · +${formatCount(box.outliersLow)}`,
            tooltip: `${formatCount(box.outliersLow)} ${values(box.outliersLow)} below ${format(box.whiskerLow)}, min is ${format(box.min)}`
          }
        : null
  };
}

/**
 * Where each of `count` dots sits across its band, as a share of the band
 * width: the golden-ratio sequence folded into the middle 60%, so equal values
 * stay apart and the same data always lands in the same place.
 */
export function dotOffsets(count: number): number[] {
  return Array.from({ length: count }, (_, index) => 0.2 + 0.6 * ((index * 0.618) % 1));
}

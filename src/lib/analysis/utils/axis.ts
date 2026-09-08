/**
 * Interior rungs of an axis: strictly inside the span, at most one per label,
 * and never closer to the last one kept than `clearance` of the axis length.
 * A repeated or overlapping label reads as a misplaced axis end. Zero earns a
 * rung when the span straddles it. Fewer than two leaves the scale to tick
 * itself. `position` is where a value lands on the axis, which on a symlog
 * scale is not where the value sits between the ends.
 */
export function interiorTicks(
  low: number,
  high: number,
  candidates: number[],
  format: (value: number) => string,
  position: (value: number) => number = (value) => value,
  clearance = 0
): number[] | undefined {
  const ordered = (low < 0 && high > 0 ? [0, ...candidates] : [...candidates]).sort(
    (a, b) => a - b
  );
  const span = Math.abs(position(high) - position(low)) || 1;
  const seen = new Set<string>();
  const ticks: number[] = [];
  let last = -Infinity;
  for (const value of ordered) {
    if (!(value > low && value < high)) continue;
    const label = format(value);
    if (seen.has(label)) continue;
    const at = Math.abs(position(value) - position(low)) / span;
    if (at - last < clearance) continue;
    seen.add(label);
    ticks.push(value);
    last = at;
  }
  return ticks.length >= 2 ? ticks : undefined;
}

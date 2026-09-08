export function interiorTicks(
  low: number,
  high: number,
  candidates: number[],
  format: (value: number) => string
): number[] | undefined {
  const seen = new Set<string>();
  const ticks = (low < 0 && high > 0 ? [0, ...candidates] : candidates).filter((value) => {
    if (!(value > low && value < high)) return false;
    const label = format(value);
    if (seen.has(label)) return false;
    seen.add(label);
    return true;
  });
  return ticks.length >= 2 ? ticks : undefined;
}

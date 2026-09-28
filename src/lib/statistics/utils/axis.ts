import { scaleLinear, scaleLog } from "d3-scale";

/** Where a value sits along an axis, 0 to 1, and the labelled rungs of it. */
export interface Axis {
  position: (value: number) => number;
  ticks: { value: number; label: string }[];
}

/** Durations a person would pick as rungs of a log axis, in milliseconds. */
const DURATION_LADDER = [
  1_000, 10_000, 60_000, 600_000, 3_600_000, 21_600_000, 86_400_000, 172_800_000, 345_600_000,
  691_200_000, 1_382_400_000, 2_764_800_000, 5_529_600_000, 11_059_200_000, 31_536_000_000
];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** At most `limit` of the candidates, spread evenly, the ends kept. */
function thin<T>(candidates: T[], limit: number): T[] {
  if (candidates.length <= limit) return candidates;
  const step = (candidates.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, i) => candidates[Math.round(i * step)]);
}

/** A linear axis from zero, or from the lowest value when it runs below zero, to a nice top. */
export function linearAxis(low: number, high: number, format: (value: number) => string): Axis {
  const scale = scaleLinear()
    .domain([Math.min(0, low), high > low ? high : low + 1])
    .range([0, 1])
    .nice(5);
  return {
    position: (value) => clamp(scale(value)),
    ticks: scale.ticks(5).map((value) => ({ value, label: format(value) }))
  };
}

/** Steps a duration axis counts in, in milliseconds. */
const DURATION_STEPS = [
  1_000, 5_000, 15_000, 60_000, 300_000, 900_000, 3_600_000, 10_800_000, 21_600_000, 43_200_000,
  86_400_000, 172_800_000, 432_000_000, 604_800_000, 1_209_600_000, 2_592_000_000, 7_776_000_000,
  31_536_000_000
];

/** A linear axis over durations from zero, its rungs whole multiples of a step a person would pick. */
export function linearDurationAxis(high: number, format: (value: number) => string): Axis {
  const step = DURATION_STEPS.find((candidate) => high / candidate <= 5) ?? DURATION_STEPS.at(-1)!;
  const top = Math.max(step, Math.ceil(high / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return {
    position: (value) => clamp(value / top),
    ticks: ticks.map((value) => ({ value, label: format(value) }))
  };
}

/** A log axis over durations. Zero has no logarithm, so anything under a second sits at the left edge. */
export function logDurationAxis(
  low: number,
  high: number,
  format: (value: number) => string
): Axis {
  const floor = Math.max(1_000, low);
  const top = Math.max(high, floor * 10);
  const scale = scaleLog().domain([floor, top]).range([0, 1]);
  const rungs = DURATION_LADDER.filter((value) => value >= floor && value <= top);
  return {
    position: (value) => clamp(scale(Math.max(value, floor))),
    ticks: thin(rungs, 6).map((value) => ({ value, label: format(value) }))
  };
}

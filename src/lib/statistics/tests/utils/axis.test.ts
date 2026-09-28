import { describe, expect, it } from "vitest";
import { linearAxis, linearDurationAxis, logDurationAxis } from "$lib/statistics/utils/axis";

describe("linearAxis", () => {
  it("runs from zero to a nice top", () => {
    const axis = linearAxis(3, 97, String);
    expect(axis.position(0)).toBe(0);
    expect(axis.position(100)).toBe(1);
    expect(axis.ticks.at(-1)?.value).toBe(100);
  });

  it("clamps values off the axis", () => {
    expect(linearAxis(0, 10, String).position(50)).toBe(1);
  });
});

describe("logDurationAxis", () => {
  it("puts sub-second durations at the left edge and spreads rungs", () => {
    const axis = logDurationAxis(0, 30 * 86_400_000, String);
    expect(axis.position(0)).toBe(0);
    expect(axis.ticks.length).toBeLessThanOrEqual(6);
    expect(axis.position(86_400_000)).toBeGreaterThan(axis.position(3_600_000));
  });
});

describe("linearDurationAxis", () => {
  it("counts in a step a person would pick", () => {
    const day = 86_400_000;
    const axis = linearDurationAxis(23 * day, String);
    expect(axis.ticks.map((t) => t.value / day)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(axis.position(25 * day)).toBe(1);
  });
});

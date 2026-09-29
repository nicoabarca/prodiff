import { describe, expect, it } from "vitest";
import { pooledMean, shade, shadeSteps } from "$lib/groups/utils/shade";

describe("shadeSteps", () => {
  it("spreads values linearly between the smallest and the largest", () => {
    expect(shadeSteps([10, 20, 30], "linear")).toEqual([0, 0.5, 1]);
  });

  it("spreads values on log1p when asked for log", () => {
    const [low, mid, high] = shadeSteps([0, Math.E - 1, Math.E ** 2 - 1], "log") as number[];
    expect(low).toBe(0);
    expect(mid).toBeCloseTo(0.5);
    expect(high).toBe(1);
  });

  it("keeps a missing value missing and leaves it out of the range", () => {
    expect(shadeSteps([null, 5, 15, null], "linear")).toEqual([null, 0, 1, null]);
  });

  it("puts every value in the middle when they are all equal", () => {
    expect(shadeSteps([7, 7, null], "linear")).toEqual([0.5, 0.5, null]);
  });

  it("puts a lone value in the middle", () => {
    expect(shadeSteps([null, 42], "log")).toEqual([null, 0.5]);
  });

  it("returns only missing values when nothing has one", () => {
    expect(shadeSteps([null, null], "linear")).toEqual([null, null]);
    expect(shadeSteps([], "linear")).toEqual([]);
  });
});

describe("pooledMean", () => {
  it("weights each mean by its case count", () => {
    expect(
      pooledMean([
        { mean: 10, n: 1 },
        { mean: 40, n: 3 }
      ])
    ).toBe(32.5);
  });

  it("ignores parts with no cases", () => {
    expect(
      pooledMean([
        { mean: 10, n: 0 },
        { mean: 40, n: 2 }
      ])
    ).toBe(40);
  });

  it("is missing when nothing carries a case", () => {
    expect(pooledMean([])).toBeNull();
    expect(pooledMean([{ mean: 5, n: 0 }])).toBeNull();
  });
});

describe("shade", () => {
  it("keeps the flat tint and the Group's own ink for a missing value", () => {
    expect(shade("group-2", null)).toEqual({
      fill: "color-mix(in oklab, var(--group-2) 8%, var(--card))",
      border: "color-mix(in oklab, var(--group-2) 45%, var(--card))",
      ink: null
    });
  });

  it("draws the smallest value light, softened and slightly see-through", () => {
    expect(shade("group-2", 0).fill).toBe(
      "oklch(from var(--group-2) 0.900 calc(c * 0.600) h / 0.9)"
    );
  });

  it("draws the largest value dark at the Group's full chroma", () => {
    expect(shade("group-original", 1).fill).toBe(
      "oklch(from var(--group-original) 0.450 calc(c * 1.000) h / 0.9)"
    );
  });

  it("derives the border from the fill", () => {
    const { fill, border } = shade("group-6", 0.5);
    expect(border).toBe(`oklch(from ${fill} calc(l - 0.12) c h / 1)`);
  });

  it("inks in the fill's own hue, dark on a light fill and light on a dark one", () => {
    const { fill, ink } = shade("group-6", 0.5);
    expect(ink).toBe(
      `oklch(from ${fill} clamp(0.32, calc((0.72 - l) * infinity), 0.92) calc(c * clamp(0.5, calc((l - 0.72) * infinity), 1)) h / 1)`
    );
  });
});

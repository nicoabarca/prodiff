import { expect, test } from "vitest";
import { interiorTicks } from "$lib/analysis/utils/axis";

test("keeps distinct interior tick labels and adds zero across it", () => {
  expect(interiorTicks(-10, 10, [0.1, 0.2, 1, 5], (value) => `${Math.round(value)}s`)).toEqual([
    0, 1, 5
  ]);
});

test("leaves sparse spans to the scale", () => {
  expect(interiorTicks(0, 10, [5], String)).toBeUndefined();
});

test("drops a rung that would overlap the last one kept", () => {
  const secs = (value: number) => `${value}s`;
  // Positions are the values themselves, so clearance is a share of the span.
  expect(interiorTicks(0, 100, [10, 12, 40, 90], secs, undefined, 0.2)).toEqual([10, 40, 90]);
});

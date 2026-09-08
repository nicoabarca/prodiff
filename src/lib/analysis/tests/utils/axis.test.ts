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

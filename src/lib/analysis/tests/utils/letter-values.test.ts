import { expect, test } from "vitest";
import { dotOffsets, letterSegments } from "$lib/analysis/utils/letter-values";

test("spreads dots over the middle of the band", () => {
  const offsets = dotOffsets(3);
  expect(offsets).toHaveLength(3);
  for (const offset of offsets) {
    expect(offset).toBeGreaterThanOrEqual(0.2);
    expect(offset).toBeLessThanOrEqual(0.8);
  }
  expect(new Set(offsets).size).toBe(3);
});

test("letterSegments cuts nested boxes into strips that do not overlap", () => {
  expect(
    letterSegments([
      { depth: 3, lower: 2, upper: 9 },
      { depth: 2, lower: 4, upper: 6 },
      { depth: 4, lower: 1, upper: 12 }
    ])
  ).toEqual([
    { depth: 2, from: 4, to: 6, share: 1 },
    { depth: 3, from: 2, to: 4, share: 0.5 },
    { depth: 3, from: 6, to: 9, share: 0.5 },
    { depth: 4, from: 1, to: 2, share: 0.25 },
    { depth: 4, from: 9, to: 12, share: 0.25 }
  ]);
});

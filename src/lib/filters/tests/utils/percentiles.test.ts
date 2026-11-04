import { describe, expect, test } from "vitest";
import {
  keptSpans,
  shareAtOrBelow,
  shareBelow,
  spannedShare,
  valueAt
} from "$lib/filters/utils/percentiles";

// 0%: 10, 25%: 20, 50%: 20, 75%: 30, 100%: 4000.
const POINTS = [10, 20, 20, 30, 4000];

describe("shares", () => {
  test("a repeated value's run begins at shareBelow and ends at shareAtOrBelow", () => {
    expect(shareBelow(POINTS, 20)).toBe(0.25);
    expect(shareAtOrBelow(POINTS, 20)).toBe(0.5);
  });

  test("a value between two points falls on the same gap from both sides", () => {
    expect(shareBelow(POINTS, 25)).toBe(0.75);
    expect(shareAtOrBelow(POINTS, 25)).toBe(0.5);
  });

  test("values past the ends stop at the ends", () => {
    expect(shareBelow(POINTS, 5)).toBe(0);
    expect(shareAtOrBelow(POINTS, 5)).toBe(0);
    expect(shareBelow(POINTS, 5000)).toBe(1);
    expect(shareAtOrBelow(POINTS, 5000)).toBe(1);
  });

  test("an outlier takes only its share of the positions", () => {
    expect(shareAtOrBelow(POINTS, 30)).toBe(0.75);
    expect(valueAt(POINTS, 0.75)).toBe(30);
  });
});

describe("keptSpans", () => {
  test("above includes the limit's whole run", () => {
    expect(keptSpans(POINTS, "above", 20, null)).toEqual([[0.25, 1]]);
  });

  test("below includes the limit's whole run", () => {
    expect(keptSpans(POINTS, "below", null, 20)).toEqual([[0, 0.5]]);
  });

  test("each mode reads only the bound it uses", () => {
    expect(keptSpans(POINTS, "above", 20, 10)).toEqual([[0.25, 1]]);
    expect(keptSpans(POINTS, "below", 30, 20)).toEqual([[0, 0.5]]);
  });

  test("between includes both limits' runs", () => {
    expect(keptSpans(POINTS, "between", 20, 30)).toEqual([[0.25, 0.75]]);
  });

  test("between with nothing in it keeps nothing", () => {
    expect(keptSpans(POINTS, "between", 22, 28)).toEqual([]);
  });

  test("outside excludes both limits' runs", () => {
    expect(keptSpans(POINTS, "outside", 20, 30)).toEqual([
      [0, 0.25],
      [0.75, 1]
    ]);
  });

  test("a one-sided outside keeps what is past that side", () => {
    expect(keptSpans(POINTS, "outside", 20, null)).toEqual([[0, 0.25]]);
    expect(keptSpans(POINTS, "outside", null, 20)).toEqual([[0.5, 1]]);
  });

  test("outside around a gap keeps everything", () => {
    expect(keptSpans(POINTS, "outside", 22, 28)).toEqual([[0, 1]]);
  });

  test("no bounds keep everything", () => {
    for (const mode of ["above", "below", "between", "outside"] as const) {
      expect(keptSpans(POINTS, mode, null, null)).toEqual([[0, 1]]);
    }
  });

  test("a column holding one value is kept whole or not at all", () => {
    const constant = [7, 7, 7];
    expect(keptSpans(constant, "below", null, 7)).toEqual([[0, 1]]);
    expect(keptSpans(constant, "above", 7, null)).toEqual([[0, 1]]);
    expect(keptSpans(constant, "outside", 7, 7)).toEqual([]);
  });
});

test("spannedShare adds the spans up", () => {
  expect(
    spannedShare([
      [0, 0.25],
      [0.75, 1]
    ])
  ).toBe(0.5);
  expect(spannedShare([])).toBe(0);
});

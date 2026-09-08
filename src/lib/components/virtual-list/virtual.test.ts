/**
 * Windowing arithmetic fails silently: a wrong range renders the wrong rows, a
 * wrong pad drifts them out from under the scrollbar, and neither throws.
 */
import { expect, test } from "vitest";
import { OVERSCAN, rowTops, windowRange, windowRangeVaried, type Window } from "./virtual";

/** The invariant that keeps rows under the scrollbar where they belong. */
function expectSpansWholeList(count: number, rowHeight: number, w: Window) {
  const rendered = (w.end - w.start) * rowHeight;
  expect(
    w.padTop + rendered + w.padBottom,
    "pads plus rendered rows must equal the full list height"
  ).toBe(count * rowHeight);
}

test("at the top of a 10,000-row list, only a screenful is rendered", () => {
  const w = windowRange(10_000, 36, 0, 720);
  expect(w.start).toBe(0);
  expect(w.end, `renders a screenful, not ${w.end} rows`).toBeLessThan(50);
  expect(w.padTop).toBe(0);
  expectSpansWholeList(10_000, 36, w);
});

test("scrolled to the middle: the window follows, and overscan sits above it", () => {
  const w = windowRange(10_000, 36, 36 * 500, 720);
  expect(w.start, "overscan renders above the viewport").toBe(500 - OVERSCAN);
  expect(w.padTop, "padTop never pushes past the scroll position").toBeLessThanOrEqual(36 * 500);
  expectSpansWholeList(10_000, 36, w);
});

test("scrolled to the very bottom: nothing is rendered past the end", () => {
  const count = 10_000;
  const w = windowRange(count, 36, 36 * count, 720);
  expect(w.end, "never renders past the last row").toBe(count);
  expect(w.padBottom).toBe(0);
  expectSpansWholeList(count, 36, w);
});

test("a list shorter than the viewport renders whole, with no padding", () => {
  const w = windowRange(3, 36, 0, 720);
  expect([w.start, w.end, w.padTop, w.padBottom]).toEqual([0, 3, 0, 0]);
});

test("empty list: no rows, no pads, no NaN", () => {
  const w = windowRange(0, 36, 0, 720);
  expect([w.start, w.end, w.padTop, w.padBottom]).toEqual([0, 0, 0, 0]);
});

test("before the container is measured, a screenful still renders", () => {
  // Otherwise the list stays blank waiting for a scroll event that never
  // arrives.
  const w = windowRange(10_000, 36, 0, 0);
  expect(w.end, "renders without a measured viewport").toBeGreaterThan(0);
});

/** The same invariant, for a list whose rows differ in height. */
function expectSpansVariedList(heights: number[], w: Window) {
  const rendered = heights.slice(w.start, w.end).reduce((sum, h) => sum + h, 0);
  const total = heights.reduce((sum, h) => sum + h, 0);
  expect(w.padTop + rendered + w.padBottom, "pads plus rendered rows must equal the list").toBe(
    total
  );
}

test("rowTops: offsets run to the full height, one entry longer than the list", () => {
  expect(rowTops([10, 20, 30])).toEqual([0, 10, 30, 60]);
  expect(rowTops([])).toEqual([0]);
});

test("varied rows: a tall row pushes the ones under it down", () => {
  const heights = [56, 118, 56, 56, 56];
  const w = windowRangeVaried(rowTops(heights), 0, 200);
  expect(w.start).toBe(0);
  expect(w.padTop).toBe(0);
  expectSpansVariedList(heights, w);
});

test("varied rows scrolled: the window starts above the scroll position", () => {
  const heights = Array.from({ length: 500 }, (_, i) => (i === 200 ? 118 : 56));
  const tops = rowTops(heights);
  const w = windowRangeVaried(tops, tops[300], 600);
  expect(w.start, "overscan renders above the viewport").toBe(300 - OVERSCAN);
  expect(w.padTop).toBeLessThanOrEqual(tops[300]);
  expectSpansVariedList(heights, w);
});

test("varied rows at the bottom: nothing is rendered past the end", () => {
  const heights = Array.from({ length: 50 }, () => 56);
  const tops = rowTops(heights);
  const w = windowRangeVaried(tops, tops[50], 600);
  expect(w.end).toBe(50);
  expect(w.padBottom).toBe(0);
  expectSpansVariedList(heights, w);
});

test("varied rows, empty list: no rows, no pads, no NaN", () => {
  const w = windowRangeVaried(rowTops([]), 0, 600);
  expect([w.start, w.end, w.padTop, w.padBottom]).toEqual([0, 0, 0, 0]);
});

test("varied rows before the container is measured: a screenful still renders", () => {
  const heights = Array.from({ length: 500 }, () => 56);
  const w = windowRangeVaried(rowTops(heights), 0, 0);
  expect(w.end).toBeGreaterThan(0);
});

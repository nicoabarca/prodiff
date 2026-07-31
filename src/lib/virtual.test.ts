/**
 * Windowing arithmetic fails silently — a wrong range renders the wrong rows,
 * a wrong pad drifts them out from under the scrollbar, and neither throws.
 * Run with `npx tsx src/lib/virtual.test.ts`.
 */
import assert from "node:assert/strict";
import { OVERSCAN, windowRange, type Window } from "./virtual";

/** The invariant that keeps rows under the scrollbar where they belong. */
function assertSpansWholeList(count: number, rowHeight: number, w: Window) {
  const rendered = (w.end - w.start) * rowHeight;
  assert.equal(
    w.padTop + rendered + w.padBottom,
    count * rowHeight,
    "pads plus rendered rows must equal the full list height"
  );
}

// At the top of a 10,000-row list, only a screenful is rendered.
{
  const w = windowRange(10_000, 36, 0, 720);
  assert.equal(w.start, 0);
  assert.ok(w.end < 50, `renders a screenful, not ${w.end} rows`);
  assert.equal(w.padTop, 0);
  assertSpansWholeList(10_000, 36, w);
}

// Scrolled to the middle: the window follows, and overscan sits above it.
{
  const w = windowRange(10_000, 36, 36 * 500, 720);
  assert.equal(w.start, 500 - OVERSCAN, "overscan renders above the viewport");
  assert.ok(w.padTop <= 36 * 500, "padTop never pushes past the scroll position");
  assertSpansWholeList(10_000, 36, w);
}

// Scrolled to the very bottom: nothing is rendered past the end.
{
  const count = 10_000;
  const w = windowRange(count, 36, 36 * count, 720);
  assert.equal(w.end, count, "never renders past the last row");
  assert.equal(w.padBottom, 0);
  assertSpansWholeList(count, 36, w);
}

// A list shorter than the viewport renders whole, with no padding.
{
  const w = windowRange(3, 36, 0, 720);
  assert.deepEqual([w.start, w.end, w.padTop, w.padBottom], [0, 3, 0, 0]);
}

// Empty list: no rows, no pads, no NaN.
{
  const w = windowRange(0, 36, 0, 720);
  assert.deepEqual([w.start, w.end, w.padTop, w.padBottom], [0, 0, 0, 0]);
}

// Before the container is measured, a screenful still renders — otherwise the
// list stays blank waiting for a scroll event that never arrives.
{
  const w = windowRange(10_000, 36, 0, 0);
  assert.ok(w.end > 0, "renders without a measured viewport");
}

console.log("virtual range: all assertions passed");

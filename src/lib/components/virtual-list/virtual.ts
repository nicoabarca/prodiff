/**
 * The windowing arithmetic, with no reactivity attached, so it is testable
 * without a Svelte runtime. `virtual.svelte.ts` wraps this in runes.
 */

/**
 * Rows kept beyond each edge of the viewport. Without them a fast scroll shows
 * blank strips, because rendering only catches up on the next frame.
 */
export const OVERSCAN = 6;

export interface Window {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

/**
 * Which slice of a fixed-height list is worth putting in the DOM, and how much
 * empty space stands in for the rest.
 *
 * `viewport` of 0 means the container hasn't been measured yet. A screenful is
 * rendered anyway, or the list stays blank waiting for a scroll event that
 * never comes.
 */
export function windowRange(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number
): Window {
  const visible = Math.ceil(viewport / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(count, start + (visible || 20) + OVERSCAN * 2);
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: Math.max(0, (count - end) * rowHeight)
  };
}

/**
 * Where each row starts, and where the list ends: `tops[i]` is the offset of row
 * `i`, and the last entry is the full height, so the array is one longer than
 * the list.
 */
export function rowTops(heights: number[]): number[] {
  const tops = [0];
  for (const height of heights) tops.push(tops[tops.length - 1] + height);
  return tops;
}

/**
 * The same window over a list whose rows differ in height, taking the offsets
 * `rowTops` produced. An unmeasured viewport falls back to a fixed count of
 * rows, for the reason `windowRange` does.
 */
export function windowRangeVaried(tops: number[], scrollTop: number, viewport: number): Window {
  const count = tops.length - 1;
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };

  let first = 0;
  while (first < count - 1 && tops[first + 1] <= scrollTop) first++;
  const start = Math.max(0, first - OVERSCAN);

  let end = start;
  if (viewport > 0) {
    const bottom = scrollTop + viewport;
    while (end < count && tops[end] < bottom) end++;
    end = Math.min(count, end + OVERSCAN);
  } else {
    end = Math.min(count, start + 20 + OVERSCAN * 2);
  }

  return { start, end, padTop: tops[start], padBottom: tops[count] - tops[end] };
}

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

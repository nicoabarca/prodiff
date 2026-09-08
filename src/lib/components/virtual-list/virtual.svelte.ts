/**
 * Windowing for a long list: which rows are worth putting in the DOM, and how
 * much empty space stands in for the rest. Headless: `virtual-list.svelte` wraps
 * this, and the maths lives in `virtual.ts`, free of runes.
 *
 * Heights are declared, never measured, so measuring cannot change what is
 * measured. One number covers a list of uniform rows; an array, one entry per
 * row, covers a list whose rows differ.
 */
import {
  rowTops,
  windowRange,
  windowRangeVaried,
  type Window
} from "$lib/components/virtual-list/virtual";

export interface VirtualRange extends Window {
  onScroll: (event: Event) => void;
  setViewport: (height: number) => void;
}

export function virtualRange(options: {
  count: () => number;
  /** A thunk, not a number: both inputs have to stay reactive to their caller. */
  rowHeight: () => number | number[];
}): VirtualRange {
  let scrollTop = $state(0);
  let viewport = $state(0);

  const range = $derived.by(() => {
    const heights = options.rowHeight();
    return Array.isArray(heights)
      ? windowRangeVaried(rowTops(heights), scrollTop, viewport)
      : windowRange(options.count(), heights, scrollTop, viewport);
  });

  return {
    get start() {
      return range.start;
    },
    get end() {
      return range.end;
    },
    get padTop() {
      return range.padTop;
    },
    get padBottom() {
      return range.padBottom;
    },
    onScroll(event: Event) {
      scrollTop = (event.currentTarget as HTMLElement).scrollTop;
    },
    setViewport(height: number) {
      viewport = height;
    }
  };
}

/**
 * Windowing for a long list: which rows are worth putting in the DOM, and how
 * much empty space stands in for the rest. Headless: `virtual-list.svelte` wraps
 * this, and the maths lives in `virtual.ts`, free of runes.
 *
 * Fixed row height only. Nothing is measured, so measuring cannot change what is
 * measured.
 */
import { windowRange, type Window } from "$lib/components/virtual-list/virtual";

export interface VirtualRange extends Window {
  /** Wire to the scroll container's `onscroll`. */
  onScroll: (event: Event) => void;
  /** Wire to the scroll container's `clientHeight`, via `bind:clientHeight`. */
  setViewport: (height: number) => void;
}

export function virtualRange(options: {
  count: () => number;
  /** A thunk, not a number: both inputs have to stay reactive to their caller. */
  rowHeight: () => number;
}): VirtualRange {
  let scrollTop = $state(0);
  let viewport = $state(0);

  const range = $derived(windowRange(options.count(), options.rowHeight(), scrollTop, viewport));

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

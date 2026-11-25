/**
 * The one tooltip every cut `Fit` shows its whole text in: which element it
 * points at, and the text. `fit-tooltip.svelte` draws it.
 */
export const fitTip = $state<{ anchor: HTMLElement | null; text: string }>({
  anchor: null,
  text: ""
});

export const FIT_TIP_ID = "fit-tip";

/** How long a pointer rests on cut text before its tooltip opens, in ms. */
const DELAY = 150;

let timer: ReturnType<typeof setTimeout> | undefined;

/** Opens the tooltip on `anchor`, at once if another `Fit` already holds it open. */
export function showFitTip(anchor: HTMLElement, text: string, delay = DELAY) {
  clearTimeout(timer);
  const open = () => {
    fitTip.anchor = anchor;
    fitTip.text = text;
  };
  if (fitTip.anchor !== null || delay === 0) open();
  else timer = setTimeout(open, delay);
}

/** Closes the tooltip if `anchor` is the element holding it, or cancels its pending open. */
export function hideFitTip(anchor: HTMLElement | null) {
  clearTimeout(timer);
  if (anchor === null || fitTip.anchor === anchor) fitTip.anchor = null;
}

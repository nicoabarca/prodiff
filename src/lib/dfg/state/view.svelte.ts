import { defaultDfgView, type DfgView } from "$lib/dfg/types";

/**
 * The sliders and the measures on the faces. Every one of them is answered from
 * the graph already in hand, so none reaches the backend and none is persisted.
 */
export const view = $state<DfgView>({ ...defaultDfgView });

/**
 * Whether the split is actually drawn. Turning it on never removes a Group, so
 * a comparison that falls back to one Group shows the single graph again on its
 * own, and comes back split if the second Group returns.
 */
export function splitting(groupCount: number): boolean {
  return view.split && groupCount === 2;
}

/**
 * Asks the canvas to fit itself again. A cut changes how much of the graph there
 * is to frame, so moving a slider reframes what is left. A split panel follows
 * the one that fits through the viewport the two share.
 */
export const refit = $state<{ at: number }>({ at: 0 });

export function reframe() {
  refit.at += 1;
}

export function setCoverage(value: number) {
  view.coverage = value;
  reframe();
}

export function setPaths(value: number) {
  view.paths = value;
  reframe();
}

export function setSplit(on: boolean) {
  view.split = on;
  reframe();
}

/** The node the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

export function reset() {
  Object.assign(view, defaultDfgView);
  selected.id = null;
}

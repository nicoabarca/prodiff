import { defaultDfgView, type DfgView } from "$lib/dfg/types";
import { placeKey, type Place } from "$lib/dfg/utils/findings";

/**
 * The measures on the faces, the direction and the split. Every one of them is
 * answered from the graph already in hand, so none reaches the backend and none
 * is persisted.
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
 * Asks the canvas to fit itself again. Applying a new Variant selection changes
 * how much of the graph there is to frame, so it reframes what is built. A split
 * panel follows the one that fits through the viewport the two share.
 */
export const refit = $state<{ at: number }>({ at: 0 });

export function reframe() {
  refit.at += 1;
}

export function setSplit(on: boolean) {
  view.split = on;
  reframe();
}

/** The node clicked on the canvas or picked in the tests panel. */
export const selected = $state<{ id: number | null }>({ id: null });

/** Whether the tests panel is open. */
export const tests = $state<{ open: boolean }>({ open: false });

/**
 * The activity or edge the tests panel last pointed at. The canvas frames it
 * each time `at` moves on and lights it while it stays pointed at. Pointing at
 * an activity also selects it; `with` is the selection it was pointed at under.
 */
export const pointed = $state<{ place: Place | null; at: number; with: number | null }>({
  place: null,
  at: 0,
  with: null
});

export function point(place: Place) {
  pointed.place = place;
  pointed.at += 1;
  selected.id = place.kind === "node" ? place.id : null;
  pointed.with = selected.id;
}

/** The place pointed at, until the selection moves on or the tests panel closes. */
export function pointedPlace(): Place | null {
  if (!tests.open || selected.id !== pointed.with) return null;
  return pointed.place;
}

export function isPointed(place: Place): boolean {
  const current = pointedPlace();
  return current !== null && placeKey(current) === placeKey(place);
}

/**
 * The place a click on the canvas opened the tests panel on: an activity, whose
 * differences the panel narrows to, or an edge, whose Waiting Time it opens and
 * scrolls to. `at` moves on with each click, so clicking the same edge again
 * scrolls back to it.
 */
export const inspected = $state<{ place: Place | null; at: number }>({ place: null, at: 0 });

/**
 * Opens the tests panel on a place clicked on the canvas. An activity is
 * selected; an edge is lit as if the panel pointed at it, without reframing.
 */
export function inspect(place: Place) {
  inspected.place = place;
  inspected.at += 1;
  tests.open = true;
  selected.id = place.kind === "node" ? place.id : null;
  if (place.kind === "edge") {
    pointed.place = place;
    pointed.with = null;
  }
}

/** Back to every test on the graph. */
export function clearInspected() {
  inspected.place = null;
}

export function reset() {
  Object.assign(view, defaultDfgView);
  selected.id = null;
  pointed.place = null;
  inspected.place = null;
}

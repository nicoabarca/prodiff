import { defaultDfgView, type DfgView, type EdgeMeasure, type Measure } from "$lib/dfg/types";
import type { Ramp } from "$lib/groups/utils/shade";
import { keptMeasure, measureKey } from "$lib/dfg/utils/measure";

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

/**
 * What the faces print and shade by. The boxes are placed from the frequency
 * behind the measure, so painting an attribute never relays the graph.
 */
export function setMeasure(measure: Measure) {
  view.measure = measure;
}

export function setEdgeMeasure(edge: EdgeMeasure) {
  view.edge = edge;
}

export function setRamp(ramp: Ramp) {
  view.ramp = ramp;
}

/** Whether the edges print the wait they were measured with. */
export function setEdgeLabels(on: boolean) {
  view.edgeLabels = on;
}

/**
 * Keeps the painted measure among the ones the build still holds, so dropping
 * an attribute from the build leaves the graph painting cases rather than
 * nothing.
 */
export function keepMeasure(options: Measure[]) {
  const kept = keptMeasure(view.measure, options);
  if (measureKey(kept) !== measureKey(view.measure)) view.measure = kept;
}

/** The node the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

/** The node the pointer is over, on the canvas or in the measures panel. */
export const hovered = $state<{ id: number | null }>({ id: null });

/** The edge whose wait was clicked. It stays lit until another one is. */
export const picked = $state<{ key: string | null }>({ key: null });

export function pickEdge(key: string) {
  picked.key = picked.key === key ? null : key;
}

export function reset() {
  Object.assign(view, defaultDfgView);
  selected.id = null;
  hovered.id = null;
  picked.key = null;
}

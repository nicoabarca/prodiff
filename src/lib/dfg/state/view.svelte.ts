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

/** One panel's simplification, in the shape `simplify` reads. */
export function knobs(side: "left" | "right"): DfgView {
  if (side === "left") return view;
  return { ...view, coverage: view.rightCoverage, paths: view.rightPaths };
}

/** The widest cut of the two, which is the superset both panels lay out on. */
export function widest(): DfgView {
  return {
    ...view,
    coverage: Math.max(view.coverage, view.rightCoverage),
    paths: Math.max(view.paths, view.rightPaths)
  };
}

/**
 * Asks a split panel to fit itself again. A cut changes how much of the graph
 * there is to frame, so a panel whose slider moved refits, and a synced one
 * refits with it: the two keep the same frame through the whole drag and are
 * free to be panned apart once it is over.
 */
export const refit = $state<{ left: number; right: number }>({ left: 0, right: 0 });

/** Both panels at once, for a change that reaches both. */
export function reframeBoth() {
  refit.left += 1;
  refit.right += 1;
}

function reframe(side: "left" | "right", synced: boolean) {
  if (synced || side === "left") refit.left += 1;
  if (synced || side === "right") refit.right += 1;
}

export function setCoverage(side: "left" | "right", value: number) {
  if (view.syncCoverage || side === "left") view.coverage = value;
  if (view.syncCoverage || side === "right") view.rightCoverage = value;
  reframe(side, view.syncCoverage);
}

export function setPaths(side: "left" | "right", value: number) {
  if (view.syncPaths || side === "left") view.paths = value;
  if (view.syncPaths || side === "right") view.rightPaths = value;
  reframe(side, view.syncPaths);
}

/** The node the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

export function reset() {
  Object.assign(view, defaultDfgView);
  selected.id = null;
}

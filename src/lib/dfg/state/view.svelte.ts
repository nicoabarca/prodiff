import { defaultDfgView, type DfgView } from "$lib/dfg/types";

/**
 * The sliders and the measures on the faces. Every one of them is answered from
 * the graph already in hand, so none reaches the backend and none is persisted.
 */
export const view = $state<DfgView>({ ...defaultDfgView });

/** The node the detail panel is showing. */
export const selected = $state<{ id: number | null }>({ id: null });

export function reset() {
  Object.assign(view, defaultDfgView);
  selected.id = null;
}

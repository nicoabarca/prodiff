import { selected } from "$lib/dfg/state/view.svelte";
import { edgeId } from "$lib/dfg/utils/fold";
import { placeIds, placeKey, type Place } from "$lib/dfg/utils/prototypes/findings";

/**
 * The place a tests panel points at on the canvas: lit while the rest dims, and
 * framed whenever `at` moves on. An activity is also the selected node.
 */
export const focused = $state<{ place: Place | null; at: number }>({ place: null, at: 0 });

export function focusOn(place: Place) {
  focused.place = place;
  focused.at += 1;
  if (place.kind === "node") selected.id = place.id;
}

export function clearFocus() {
  focused.place = null;
}

export function isFocused(place: Place): boolean {
  return focused.place !== null && placeKey(focused.place) === placeKey(place);
}

/** The canvas ids to light: the node, or the edge and both of its ends. */
export function litIds(place: Place | null): { nodes: Set<string>; edges: Set<string> } | null {
  if (!place) return null;
  return {
    nodes: new Set(placeIds(place).map(String)),
    edges: new Set(place.kind === "edge" ? [edgeId(place.source, place.target)] : [])
  };
}

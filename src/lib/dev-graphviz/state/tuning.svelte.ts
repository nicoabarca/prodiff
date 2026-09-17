import { defaultGraphvizTunings, type GraphvizTunings } from "$lib/dev-graphviz/types";
import { dotAttributes } from "$lib/dev-graphviz/utils/dot-attributes";
import type { DotAttributes } from "$lib/dfg/utils/layout-graphviz";
import { isSpaghetti } from "$lib/dfg/utils/layout";
import type { Simplified } from "$lib/dfg/utils/simplify";
import { loadStored, saveStored } from "$lib/components/tuning-form/storage";

const STORAGE_KEY = "dev.graphviz-tuning";

/** The tuning panel's `dot` attributes, kept in this browser's storage. */
export const tunings = $state<GraphvizTunings>(loadStored(STORAGE_KEY, defaultGraphvizTunings));

export const tierOf = (graph: Simplified): keyof GraphvizTunings =>
  isSpaghetti(graph) ? "spaghetti" : "compact";

export function saveTunings() {
  saveStored(STORAGE_KEY, $state.snapshot(tunings));
}

export function resetTuning(tier: keyof GraphvizTunings) {
  tunings[tier] = structuredClone(defaultGraphvizTunings[tier]);
  saveTunings();
}

/** Reads the tuning reactively, so a layout effect calling it reruns on edits. */
export function graphvizOverride(graph: Simplified): DotAttributes {
  return dotAttributes($state.snapshot(tunings[tierOf(graph)]));
}

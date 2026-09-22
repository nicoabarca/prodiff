import { loadStored, saveStored } from "$lib/components/tuning-form/storage";
import type { Tier } from "$lib/components/tuning-form/types";
import type { ElkTunings } from "$lib/dev-elk/types";
import { defaultElkTunings, elkOptions } from "$lib/dev-elk/utils/elk-options";
import { isSpaghetti } from "$lib/dfg/utils/layout";
import type { Simplified } from "$lib/dfg/utils/simplify";

const STORAGE_KEY = "dev.elk-tuning";

/** The tuning panel's ELK options, kept in this browser's storage. */
export const tunings = $state<ElkTunings>(loadStored(STORAGE_KEY, defaultElkTunings));

export const tierOf = (graph: Simplified): Tier => (isSpaghetti(graph) ? "spaghetti" : "compact");

export function saveTunings() {
  saveStored(STORAGE_KEY, $state.snapshot(tunings));
}

export function resetTuning(tier: Tier) {
  tunings[tier] = structuredClone(defaultElkTunings[tier]);
  saveTunings();
}

/** Reads the tuning reactively, so a layout effect calling it reruns on edits. */
export function elkOverride(graph: Simplified): Record<string, string> {
  return elkOptions($state.snapshot(tunings[tierOf(graph)]));
}

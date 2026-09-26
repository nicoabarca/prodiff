import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseDurationBin } from "$lib/filters/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** Case durations of `chain`'s population, binned for the duration brush. */
export function durationHistogram(
  project: Project,
  chain: Filter[]
): Promise<ResponseDurationBin[]> {
  return invoke<ResponseDurationBin[]>("duration_histogram", {
    projectId: project.id,
    chain,
    columns: analysisColumns(project)
  });
}

import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { DurationBin } from "$lib/filters/invokers/types";

/** Case durations of `chain`'s population, binned for the duration brush. */
export function durationHistogram(project: Project, chain: Filter[]): Promise<DurationBin[]> {
  return invoke<DurationBin[]>("duration_histogram", {
    projectId: project.id,
    chain,
    columns: project.columns
  });
}

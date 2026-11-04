import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/**
 * A numeric column's observed values at evenly spaced ranks in `chain`'s
 * population, ascending. Empty when the column holds none.
 */
export function numericPercentiles(
  project: Project,
  column: string,
  chain: Filter[]
): Promise<number[]> {
  return invoke<number[]>("numeric_percentiles", {
    projectId: project.id,
    column,
    chain,
    columns: analysisColumns(project)
  });
}

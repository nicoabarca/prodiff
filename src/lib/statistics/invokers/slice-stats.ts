import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseEventLogStats } from "$lib/slices/invokers/types";

/**
 * Statistics for several chains at once. Batched deliberately: the whole log,
 * the base and every slice share one read of the Parquet file.
 */
export function sliceStats(project: Project, chains: Filter[][]): Promise<ResponseEventLogStats[]> {
  return invoke<ResponseEventLogStats[]>("slice_stats", {
    projectId: project.id,
    chains,
    columns: project.columns
  });
}

import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { EventLogStats } from "$lib/slices/invokers/types";

/**
 * Statistics for several chains at once. Batched deliberately: the whole log,
 * the base and every slice share one read of the Parquet file.
 */
export function sliceStats(project: Project, chains: Filter[][]): Promise<EventLogStats[]> {
  return invoke<EventLogStats[]>("slice_stats", {
    projectId: project.id,
    chains,
    columns: project.columns
  });
}

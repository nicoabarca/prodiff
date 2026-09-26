import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponseDayLoad } from "$lib/filters/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** Cases per day over `chain`'s population, for the timeframe brush. */
export function dailyCaseLoad(project: Project, chain: Filter[]): Promise<ResponseDayLoad[]> {
  return invoke<ResponseDayLoad[]>("daily_case_load", {
    projectId: project.id,
    chain,
    columns: analysisColumns(project)
  });
}

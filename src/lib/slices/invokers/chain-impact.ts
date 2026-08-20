import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { ResponseChainStep } from "$lib/slices/invokers/types";

/**
 * Sizes after each prefix of `chain`: index 0 is the unfiltered log, index
 * `i + 1` the result after filter `i`. Used to show what each filter costs.
 */
export function chainImpact(project: Project, chain: Filter[]): Promise<ResponseChainStep[]> {
  return invoke<ResponseChainStep[]>("chain_impact", {
    projectId: project.id,
    chain,
    columns: project.columns
  });
}

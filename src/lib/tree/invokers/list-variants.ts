import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";

/**
 * Every Variant of the filtered log, most cases first. Independent of the
 * build, so it reaches Variants no build included.
 */
export function listVariants(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null
): Promise<ResponseVariantRow[]> {
  return invoke<ResponseVariantRow[]>("list_variants", {
    projectId: project.id,
    groupA,
    groupB,
    columns: project.columns
  });
}

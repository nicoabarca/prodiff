import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { VariantRow } from "$lib/tree/invokers/types";

/**
 * Every Variant of the filtered log, most cases first. Independent of the
 * build, so the picker works before the first one — and reaches Variants no
 * build included, which is the whole reason it isn't derived from the tree.
 */
export function listVariants(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null
): Promise<VariantRow[]> {
  return invoke<VariantRow[]>("list_variants", {
    projectId: project.id,
    groupA,
    groupB,
    columns: project.columns
  });
}

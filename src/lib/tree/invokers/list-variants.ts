import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseVariantRow } from "$lib/tree/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/**
 * Every Variant of the Groups given, most cases first. Independent of the
 * build, so it reaches Variants no build included.
 */
export function listVariants(project: Project, groups: string[]): Promise<ResponseVariantRow[]> {
  return invoke<ResponseVariantRow[]>("list_variants", {
    projectId: project.id,
    groups,
    columns: analysisColumns(project)
  });
}

import { invoke } from "@tauri-apps/api/core";
import type { Outliers } from "$lib/analysis/types";
import type { Project } from "$lib/event-log/types";
import type { RequestDfgOutlierTarget } from "$lib/dfg/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/**
 * The values past the whiskers of one box plot the DFG draws, keyed by Group
 * id, over the cases of `selectedVariants`. Empty sends `null`, which is every
 * Variant.
 */
export function dfgOutliers(
  project: Project,
  groups: string[],
  selectedVariants: string[],
  target: RequestDfgOutlierTarget
): Promise<Record<string, Outliers>> {
  return invoke<Record<string, Outliers>>("dfg_outliers", {
    projectId: project.id,
    groups,
    columns: analysisColumns(project),
    variants: selectedVariants.length > 0 ? selectedVariants : null,
    target
  });
}

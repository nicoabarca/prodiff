import { invoke } from "@tauri-apps/api/core";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { Project } from "$lib/event-log/types";
import type { RequestDfgAttribute, ResponseDfg } from "$lib/dfg/invokers/types";

/**
 * Builds the whole graph from the Groups' materialized Parquet files. `groups`
 * is ordered and holds one or two ids; one is single-Group mode, which ships
 * counts and Summaries but no Significance Test.
 *
 * `selectedVariants` is cut before anything is aggregated, so every Summary and
 * Significance Test describes exactly those Variants. Empty sends `null`,
 * which is every Variant, not a cold-build default like the tree's.
 *
 * Nothing about the drawing crosses the seam: the simplification thresholds and
 * the layout are the frontend's, so moving a slider never calls this again.
 */
export function dfg(
  project: Project,
  groups: string[],
  attributes: string[],
  selectedVariants: string[]
): Promise<ResponseDfg> {
  return invoke<ResponseDfg>("dfg", {
    projectId: project.id,
    groups,
    attributes: attributes.map(requestAttribute),
    columns: project.columns,
    variants: selectedVariants.length > 0 ? selectedVariants : null
  });
}

function requestAttribute(name: string): RequestDfgAttribute {
  if (name === ACTIVITY_DURATION) return { kind: "activityDuration" };
  if (name === TRANSITION_TIME) return { kind: "transitionTime" };
  return { kind: "column", name };
}

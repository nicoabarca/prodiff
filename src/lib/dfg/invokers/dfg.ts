import { invoke } from "@tauri-apps/api/core";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { Project } from "$lib/event-log/types";
import type { RequestDfgAttribute, ResponseDfg } from "$lib/dfg/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/**
 * Builds the whole graph from the Groups' materialized Parquet files. `groups`
 * is ordered and holds one or two ids; one is single-Group mode, which ships
 * counts and Summaries but no Significance Test.
 *
 * `selectedVariants` is cut before anything is aggregated, so every Summary and
 * Significance Test describes exactly those Variants. Empty sends `null`, which
 * is every Variant, not a cold-build default like the tree's.
 *
 * Nothing about the drawing crosses the seam: the simplification thresholds and
 * the layout are the frontend's, so moving a slider never calls this again.
 *
 * Waiting Time is always asked for, whatever `attributes` holds: the graph draws
 * it on its edges and scales their width by it, so it is part of the map rather
 * than something to opt into. `attributes` is what the activities are tested on.
 */
export function dfg(
  project: Project,
  groups: string[],
  attributes: string[],
  selectedVariants: string[]
): Promise<ResponseDfg> {
  const asked = attributes.includes(TRANSITION_TIME)
    ? attributes
    : [...attributes, TRANSITION_TIME];
  return invoke<ResponseDfg>("dfg", {
    projectId: project.id,
    groups,
    attributes: asked.map(requestAttribute),
    columns: analysisColumns(project),
    variants: selectedVariants.length > 0 ? selectedVariants : null
  });
}

function requestAttribute(name: string): RequestDfgAttribute {
  if (name === ACTIVITY_DURATION) return { kind: "activityDuration" };
  if (name === TRANSITION_TIME) return { kind: "transitionTime" };
  return { kind: "column", name };
}

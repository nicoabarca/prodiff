import { invoke } from "@tauri-apps/api/core";
import { ACTIVITY_DURATION, TRANSITION_TIME } from "$lib/analysis/attributes";
import type { Project } from "$lib/event-log/types";
import type { RequestDfgAttribute, ResponseDfg } from "$lib/dfg/invokers/types";
import { ACTIVITY_FREQUENCY, EDGE_FREQUENCY, REPETITIONS } from "$lib/dfg/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/**
 * Builds the whole graph from the Groups' materialized Parquet files. `groups`
 * is ordered and holds one or two ids; one is single-Group mode, which ships
 * counts and Summaries but no Significance Test.
 *
 * `selectedVariants` is cut before anything is aggregated, so every Summary and
 * Significance Test describes exactly those Variants, which are the ones the
 * graph draws. Empty sends `null`, which is every Variant.
 *
 * Nothing about the drawing crosses the seam: the layout and the measures on
 * the faces are the frontend's.
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
    columns: analysisColumns(project),
    variants: selectedVariants.length > 0 ? selectedVariants : null
  });
}

function requestAttribute(name: string): RequestDfgAttribute {
  if (name === ACTIVITY_DURATION) return { kind: "activityDuration" };
  if (name === TRANSITION_TIME) return { kind: "transitionTime" };
  if (name === ACTIVITY_FREQUENCY) return { kind: "activityFrequency" };
  if (name === EDGE_FREQUENCY) return { kind: "edgeFrequency" };
  if (name === REPETITIONS) return { kind: "repetitions" };
  return { kind: "column", name };
}

import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { NodeDistributions } from "$lib/distributions/invokers/types";
import type { Scope } from "$lib/distributions/types";

/**
 * One node's Distributions. `variants` is the Variant key of every visible leaf
 * under the node and `depth` its distance from the Start root — the pair that
 * identifies the node without either side re-deriving it from activity labels.
 */
export function nodeDistributions(
  project: Project,
  groupA: Filter[],
  groupB: Filter[] | null,
  attributes: string[],
  variants: string[],
  depth: number,
  scope: Scope
): Promise<NodeDistributions> {
  return invoke<NodeDistributions>("node_distributions", {
    projectId: project.id,
    groupA,
    groupB,
    columns: project.columns,
    attributes,
    variants,
    depth,
    scope
  });
}

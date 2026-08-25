import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { ResponseNodeDistributions } from "$lib/distributions/invokers/types";
import type { Scope } from "$lib/distributions/types";

/**
 * One node's Distributions. `variants` is the Variant key of every visible leaf
* under the node and `depth` its distance from the Start root.
 */
export function nodeDistributions(
  project: Project,
  groups: string[],
  attributes: string[],
  variants: string[],
  depth: number,
  scope: Scope
): Promise<ResponseNodeDistributions> {
  return invoke<ResponseNodeDistributions>("node_distributions", {
    projectId: project.id,
    groups,
    columns: project.columns,
    attributes,
    variants,
    depth,
    scope
  });
}

import { invoke } from "@tauri-apps/api/core";
import type { LetterValues } from "$lib/analysis/types";
import type { Project } from "$lib/event-log/types";
import type { RequestTreeOutlierTarget } from "$lib/tree/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

/** The letter-value plot of one box plot the tree draws, keyed by Group id. */
export function treeLetterValues(
  project: Project,
  groups: string[],
  target: RequestTreeOutlierTarget
): Promise<Record<string, LetterValues>> {
  return invoke<Record<string, LetterValues>>("tree_letter_values", {
    projectId: project.id,
    groups,
    columns: analysisColumns(project),
    target
  });
}

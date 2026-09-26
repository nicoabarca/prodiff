import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponsePreviewTable } from "$lib/groups/invokers/types";
import { analysisColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";

export function groupPreview(
  project: Project,
  filters: Filter[],
  offset: number,
  limit: number
): Promise<ResponsePreviewTable> {
  return invoke<ResponsePreviewTable>("group_preview", {
    projectId: project.id,
    filters,
    columns: analysisColumns(project),
    offset,
    limit
  });
}

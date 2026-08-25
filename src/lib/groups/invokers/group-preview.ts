import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponsePreviewTable } from "$lib/groups/invokers/types";

export function groupPreview(
  project: Project,
  filters: Filter[],
  limit: number
): Promise<ResponsePreviewTable> {
  return invoke<ResponsePreviewTable>("group_preview", {
    projectId: project.id,
    filters,
    columns: project.columns,
    limit
  });
}

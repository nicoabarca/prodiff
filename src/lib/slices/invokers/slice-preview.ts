import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/filters/filter";
import type { PreviewTable } from "$lib/slices/invokers/types";

export function slicePreview(
  project: Project,
  chain: Filter[],
  limit: number
): Promise<PreviewTable> {
  return invoke<PreviewTable>("slice_preview", {
    projectId: project.id,
    chain,
    columns: project.columns,
    limit
  });
}

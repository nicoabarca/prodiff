import { invoke } from "@tauri-apps/api/core";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { ResponsePreviewTable } from "$lib/slices/invokers/types";

export function slicePreview(
  project: Project,
  chain: Filter[],
  limit: number
): Promise<ResponsePreviewTable> {
  return invoke<ResponsePreviewTable>("slice_preview", {
    projectId: project.id,
    chain,
    columns: project.columns,
    limit
  });
}

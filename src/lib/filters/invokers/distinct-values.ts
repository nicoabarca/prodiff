import { invoke } from "@tauri-apps/api/core";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { EndpointPosition } from "$lib/filters/kind/endpoint";
import type { ResponseDistinctValues } from "$lib/filters/invokers/types";

/**
 * The values a column holds, for the editor's value picker. `endpoint` narrows
 * the scan to the activity at that end of each case; `null` reads every event.
 */
export function distinctValues(
  projectId: string,
  column: string,
  columns: RequestColumnMapping[],
  limit: number,
  endpoint: EndpointPosition | null = null
): Promise<ResponseDistinctValues> {
  return invoke<ResponseDistinctValues>("distinct_values", {
    projectId,
    column,
    columns,
    limit,
    endpoint
  });
}

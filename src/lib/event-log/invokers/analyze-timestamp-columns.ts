import { invoke } from "@tauri-apps/api/core";
import type { ResponseTimestampColumnReport } from "$lib/event-log/invokers/types";
import { FORMAT_CATALOG } from "$lib/event-log/utils/timestamp-format";

export function analyzeTimestampColumns(
  filePath: string,
  columns: string[],
  patterns: string[] = FORMAT_CATALOG
): Promise<ResponseTimestampColumnReport[]> {
  return invoke<ResponseTimestampColumnReport[]>("analyze_timestamp_columns", {
    path: filePath,
    columns,
    patterns
  });
}

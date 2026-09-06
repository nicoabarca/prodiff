import { invoke } from "@tauri-apps/api/core";
import type { ResponseTimestampColumnReport } from "$lib/event-log/invokers/types";
import { FORMAT_CATALOG } from "$lib/event-log/utils/timestamp-format";

/**
 * Full-file counts for the named columns. The preview's rows are enough to
 * guess a format and never enough to trust one, so the catalog is sent to Rust
 * and matched against every row.
 */
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

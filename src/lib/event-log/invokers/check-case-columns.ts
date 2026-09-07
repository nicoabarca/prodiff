import { invoke } from "@tauri-apps/api/core";
import type { ResponseCaseColumnViolation } from "$lib/event-log/invokers/types";

/** Only the violating columns come back. */
export function checkCaseColumns(
  sourcePath: string,
  caseColumn: string,
  columns: string[]
): Promise<ResponseCaseColumnViolation[]> {
  return invoke<ResponseCaseColumnViolation[]>("check_case_columns", {
    sourcePath,
    caseColumn,
    columns
  });
}

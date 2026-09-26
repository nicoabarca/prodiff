import { TRANSITION_TIME } from "$lib/analysis/attributes";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Filter } from "$lib/filters/kind/filter";

/**
 * The Sample Project's id, `uuidv5("prodiff:sample-project", URL)`. Fixed, so
 * creating the Sample Project again replaces the one already there.
 */
export const SAMPLE_PROJECT_ID = "30fe30dc-de6c-571c-9c97-598bca4b0f83";

/**
 * The version of the Sample Project this build ships. Raise it whenever the
 * log or this manifest changes, so an existing Sample Project offers to update.
 */
export const SAMPLE_VERSION = 1;

/** The names of the Groups the Sample Project starts with, which Tours point at. */
export const SAMPLE_GROUPS = {
  approved: "Approved",
  rejected: "Rejected",
  slowCases: "Slow cases"
} as const;

/**
 * A Group the Sample Project starts with. An `applied` one is written to
 * Parquet at creation; the others start as an unapplied Filter List.
 */
export interface SampleGroup {
  name: string;
  filters: Filter[];
  applied: boolean;
}

/**
 * Everything the Sample Project starts with besides its Event Log, which is
 * `src-tauri/resources/sample-project/loan-applications.csv`. `compared` names
 * the Groups the tree opens on, and must name applied ones.
 */
export interface SampleManifest {
  name: string;
  fileName: string;
  columns: RequestColumnMapping[];
  groups: SampleGroup[];
  compared: string[];
  treeAttributes: string[];
}

const outcome = (value: string): Filter => ({
  kind: "attribute",
  column: "Outcome",
  mode: "mandatory",
  values: [value]
});

const caseColumn = (name: string, type: "string" | "float"): RequestColumnMapping => ({
  name,
  role: "other",
  scope: "case",
  caseResolution: "constant",
  type
});

export const SAMPLE_MANIFEST: SampleManifest = {
  name: "Loan applications (sample)",
  fileName: "loan-applications.csv",
  columns: [
    { name: "Case ID", role: "case_id", scope: "case", caseResolution: "constant", type: "string" },
    { name: "Activity", role: "activity_name", scope: "event", type: "string" },
    {
      name: "Timestamp",
      role: "complete_timestamp",
      scope: "event",
      type: "datetime",
      timestampFormat: "YYYY-MM-DD HH:mm:ss"
    },
    { name: "Resource", role: "other", scope: "event", type: "string" },
    caseColumn("Loan type", "string"),
    caseColumn("Amount", "float"),
    caseColumn("Channel", "string"),
    caseColumn("Region", "string"),
    caseColumn("Outcome", "string")
  ],
  groups: [
    { name: SAMPLE_GROUPS.approved, filters: [outcome("Approved")], applied: true },
    { name: SAMPLE_GROUPS.rejected, filters: [outcome("Rejected")], applied: true },
    {
      name: SAMPLE_GROUPS.slowCases,
      filters: [{ kind: "duration", mode: "above", min: 12, max: null }],
      applied: false
    }
  ],
  compared: [SAMPLE_GROUPS.approved, SAMPLE_GROUPS.rejected],
  treeAttributes: ["Amount", "Channel", "Loan type", "Region", TRANSITION_TIME]
};

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SAMPLE_MANIFEST } from "../../src/lib/sample-project/manifest";
import { generateSampleLog, SAMPLE_HEADER } from "../sample-log";

const SAMPLE_LOG = join(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."),
  "src-tauri",
  "resources",
  "sample-project",
  "loan-applications.csv"
);

describe("the sample Event Log", () => {
  it("is what the generator writes", () => {
    expect(readFileSync(SAMPLE_LOG, "utf8")).toBe(generateSampleLog());
  });

  it("has exactly the columns the manifest maps", () => {
    expect(SAMPLE_MANIFEST.columns.map((column) => column.name)).toEqual([...SAMPLE_HEADER]);
  });

  it("has a Variant only rejected applications follow", () => {
    const traces = new Map<string, { activities: string[]; outcome: string }>();
    for (const line of generateSampleLog().trim().split("\n").slice(1)) {
      const [caseId, activity, , , , , , , outcome] = line.split(",");
      const trace = traces.get(caseId) ?? { activities: [], outcome };
      trace.activities.push(activity);
      traces.set(caseId, trace);
    }
    const early = [...traces.values()].filter(
      (trace) =>
        trace.activities.join(">") === "Submit application>Check completeness>Reject application"
    );
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((trace) => trace.outcome === "Rejected")).toBe(true);
  });
});

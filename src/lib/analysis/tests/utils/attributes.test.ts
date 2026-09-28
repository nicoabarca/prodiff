import { describe, expect, it } from "vitest";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import { ACTIVITY_DURATION, attributeOptions, TRANSITION_TIME } from "$lib/analysis/attributes";

function column(name: string, overrides: Partial<RequestColumnMapping> = {}): RequestColumnMapping {
  return { name, type: "string", role: "other", granularity: "event", ...overrides };
}

describe("attributeOptions", () => {
  const columns = [
    column("zone"),
    column("Amount", { type: "float" }),
    column("beta"),
    column("case", { role: "case_id" }),
    column("start", { role: "start_timestamp" })
  ];

  it("orders the columns by name and pins the derived attributes last", () => {
    expect(attributeOptions(columns)).toEqual([
      "Amount",
      "beta",
      "zone",
      ACTIVITY_DURATION,
      TRANSITION_TIME
    ]);
  });

  it("leaves out Activity Duration without a start timestamp", () => {
    const noStart = columns.filter((c) => c.role !== "start_timestamp");
    expect(attributeOptions(noStart)).toEqual(["Amount", "beta", "zone", TRANSITION_TIME]);
  });

  it("puts custom attributes after the derived ones, in the order given", () => {
    expect(attributeOptions(columns, [], ["fx_b", "fx_a"]).slice(-3)).toEqual([
      TRANSITION_TIME,
      "fx_b",
      "fx_a"
    ]);
  });

  it("leaves hidden columns out", () => {
    expect(attributeOptions(columns, ["beta"])).toEqual([
      "Amount",
      "zone",
      ACTIVITY_DURATION,
      TRANSITION_TIME
    ]);
  });
});

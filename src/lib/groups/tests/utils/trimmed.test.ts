import { describe, expect, it } from "vitest";
import { ATTRIBUTE_MODES } from "$lib/filters/kind/attribute";
import { ENDPOINT_MODES } from "$lib/filters/kind/endpoint";
import type { Filter } from "$lib/filters/kind/filter";
import { FOLLOWER_MODES } from "$lib/filters/kind/follower";
import { NUMERIC_MODES } from "$lib/filters/kind/numeric";
import { TIMEFRAME_MODES } from "$lib/filters/kind/timeframe";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import { isTrimmed } from "$lib/groups/utils/trimmed";

const everyFilter: Filter[] = [
  ...ATTRIBUTE_MODES.map((mode): Filter => ({ kind: "attribute", column: "a", mode, values: [] })),
  ...TIMEFRAME_MODES.map((mode): Filter => ({ kind: "timeframe", mode, from: 0, to: 1 })),
  ...NUMERIC_MODES.map((mode): Filter => ({ kind: "numeric", column: "n", mode, min: 0, max: 1 })),
  ...NUMERIC_MODES.map((mode): Filter => ({ kind: "duration", mode, min: 0, max: 1 })),
  ...ENDPOINT_MODES.map((mode): Filter => ({
    kind: "endpoint",
    position: "start",
    mode,
    activities: []
  })),
  ...FOLLOWER_MODES.map((mode): Filter => ({
    kind: "follower",
    column: "a",
    mode,
    reference: [],
    follower: []
  })),
  { kind: "case_not_in_group", groupId: "g" }
];

describe("isTrimmed", () => {
  it("is true only for attribute keep_selected and timeframe trim", () => {
    const trimming = everyFilter.filter((filter) => isTrimmed([filter], []));
    expect(trimming).toEqual([
      { kind: "attribute", column: "a", mode: "keep_selected", values: [] },
      { kind: "timeframe", mode: "trim", from: 0, to: 1 }
    ]);
  });

  it("finds a trimming Filter anywhere in the list", () => {
    expect(isTrimmed([], [])).toBe(false);
    expect(isTrimmed(everyFilter, [])).toBe(true);
  });

  it("is false for keep_selected on a case-level column, which keeps whole cases", () => {
    const keep: Filter = { kind: "attribute", column: "a", mode: "keep_selected", values: [] };
    const column = (scope: Partial<RequestColumnMapping>) =>
      ({ name: "a", role: "other", type: "string", ...scope }) as RequestColumnMapping;
    expect(isTrimmed([keep], [column({ scope: "case", caseResolution: "first" })])).toBe(false);
    expect(isTrimmed([keep], [column({ scope: "event" })])).toBe(true);
  });
});

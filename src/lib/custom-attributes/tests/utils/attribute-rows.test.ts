import { describe, expect, it } from "vitest";
import { ACTIVITY_DURATION } from "$lib/analysis/attributes";
import {
  attributeRows,
  attributeSections,
  namesBetween,
  withNames
} from "$lib/custom-attributes/utils/attribute-rows";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";

const columns: RequestColumnMapping[] = [
  { name: "amount", role: "other", scope: "case", caseResolution: "constant", type: "float" },
  { name: "channel", role: "other", scope: "event", type: "string" },
  { name: "fx_1", role: "other", scope: "event", type: "float" }
];

describe("attributeRows", () => {
  it("reads granularity and data type from the column", () => {
    expect(attributeRows(["amount", "channel"], columns)).toEqual([
      { name: "amount", granularity: "case", dataType: "Decimal" },
      { name: "channel", granularity: "event", dataType: "Text" }
    ]);
  });

  it("lists a name with no column as derived", () => {
    expect(attributeRows([ACTIVITY_DURATION, "Repetitions"], columns)).toEqual([
      { name: ACTIVITY_DURATION, granularity: "derived", dataType: "Time Duration" },
      { name: "Repetitions", granularity: "derived", dataType: "Count" }
    ]);
  });

  it("gives a Custom Attribute the scope of its column", () => {
    expect(attributeRows(["fx_1"], columns)).toEqual([
      { name: "fx_1", granularity: "event", dataType: "Decimal" }
    ]);
  });
});

describe("attributeSections", () => {
  it("orders sections and drops empty ones", () => {
    const rows = attributeRows(["Repetitions", "amount"], columns);
    expect(attributeSections(rows).map((section) => section.granularity)).toEqual([
      "case",
      "derived"
    ]);
  });
});

describe("withNames", () => {
  it("adds names once and keeps the others", () => {
    expect(withNames(["a", "b"], ["b", "c"], true)).toEqual(["a", "b", "c"]);
  });

  it("removes names", () => {
    expect(withNames(["a", "b", "c"], ["a", "c"], false)).toEqual(["b"]);
  });
});

describe("namesBetween", () => {
  const order = ["a", "b", "c", "d"];

  it("spans both directions", () => {
    expect(namesBetween(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(namesBetween(order, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("falls back to the target when the anchor is gone", () => {
    expect(namesBetween(order, "z", "c")).toEqual(["c"]);
  });
});

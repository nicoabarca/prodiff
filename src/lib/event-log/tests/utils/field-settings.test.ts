import { describe, expect, it } from "vitest";
import { inferExtraFieldType, scopingOf, typingOf } from "$lib/event-log/utils/field-settings";

describe("scopingOf", () => {
  it("leaves an event-scoped field without a resolution", () => {
    expect(scopingOf("event", "last")).toEqual({ scope: "event" });
  });

  it("carries the selected resolution on a case-scoped field", () => {
    expect(scopingOf("case", "last")).toEqual({ scope: "case", caseResolution: "last" });
  });
});

describe("typingOf", () => {
  it("leaves a non-temporal field without a timestamp format", () => {
    expect(typingOf("integer", "DD/MM/YYYY")).toEqual({ type: "integer" });
  });

  it("carries the declared pattern on a temporal field", () => {
    expect(typingOf("date", "DD/MM/YYYY")).toEqual({
      type: "date",
      timestampFormat: "DD/MM/YYYY"
    });
  });

  it("keeps a temporal field with no declared pattern", () => {
    expect(typingOf("datetime", null)).toEqual({ type: "datetime", timestampFormat: null });
  });
});

describe("inferExtraFieldType", () => {
  it("reads a column the file stores as a timestamp as a datetime", () => {
    expect(inferExtraFieldType("datetime")).toBe("datetime");
    expect(inferExtraFieldType("date")).toBe("datetime");
  });

  it("reads numbers as numbers and everything else as text", () => {
    expect(inferExtraFieldType("integer")).toBe("number");
    expect(inferExtraFieldType("float")).toBe("number");
    expect(inferExtraFieldType("boolean")).toBe("string");
  });
});

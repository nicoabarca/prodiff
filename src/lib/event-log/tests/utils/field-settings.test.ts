import { describe, expect, it } from "vitest";
import { resolutionForScope } from "$lib/event-log/utils/field-settings";

describe("resolutionForScope", () => {
  it("normalizes event-scoped fields to the only meaningful resolution", () => {
    expect(resolutionForScope("event", "last")).toBe("constant");
  });

  it("retains the selected case resolution", () => {
    expect(resolutionForScope("case", "last")).toBe("last");
  });
});

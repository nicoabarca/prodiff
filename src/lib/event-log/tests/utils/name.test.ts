import { describe, expect, it } from "vitest";
import { cleanName, NAME_MAX_LENGTH } from "$lib/event-log/utils/name";

describe("cleanName", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanName("  Paid late  ")).toBe("Paid late");
  });

  it("cuts a long name to the limit", () => {
    const long = "High amount per day, fined in 2023 and paid late";
    expect(cleanName(long)).toBe("High amount per day, fined in 2023 and p");
    expect(cleanName(long)).toHaveLength(NAME_MAX_LENGTH);
  });

  it("drops a space the cut leaves at the end", () => {
    expect(cleanName(`${"a".repeat(39)} tail`)).toBe("a".repeat(39));
  });

  it("returns an empty string for a blank name", () => {
    expect(cleanName("   ")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { openedLabel, shortCount } from "$lib/home/utils/format";

describe("shortCount", () => {
  it("shortens only past ten thousand", () => {
    expect(shortCount(9_999)).toBe("9,999");
    expect(shortCount(41_380)).toBe("41.4k");
    expect(shortCount(1_202_267)).toBe("1.20M");
  });
});

describe("openedLabel", () => {
  const now = new Date(2026, 8, 28, 15);

  it("names today and yesterday", () => {
    expect(openedLabel(new Date(2026, 8, 28, 9).toISOString(), now)).toBe("today");
    expect(openedLabel(new Date(2026, 8, 27, 23).toISOString(), now)).toBe("yesterday");
  });

  it("gives the date otherwise, with the year only when it differs", () => {
    expect(openedLabel(new Date(2026, 8, 24).toISOString(), now)).toBe("Sep 24");
    expect(openedLabel(new Date(2025, 8, 24).toISOString(), now)).toBe("Sep 24, 2025");
  });
});

import { describe, expect, it } from "vitest";
import {
  effectLabel,
  formatP,
  formatSigned,
  isGap,
  percentChange,
  share
} from "$lib/statistics/utils/change";

describe("percentChange", () => {
  it("measures B against A", () => {
    expect(percentChange(200, 150)).toBe(-25);
  });

  it("has no ratio from zero", () => {
    expect(percentChange(0, 3)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
  });
});

describe("formatSigned", () => {
  it("signs with a true minus", () => {
    expect(formatSigned(-12.345, 1, "%")).toBe("−12.3%");
    expect(formatSigned(3, 1, " pp")).toBe("+3.0 pp");
  });

  it("drops a difference that rounds to nothing", () => {
    expect(formatSigned(0.04)).toBe("—");
    expect(formatSigned(null)).toBe("—");
  });
});

describe("helpers", () => {
  it("shares and gaps", () => {
    expect(share(1, 4)).toBe(25);
    expect(share(1, 0)).toBe(0);
    expect(isGap(-5)).toBe(true);
    expect(isGap(4.9)).toBe(false);
    expect(isGap(null)).toBe(false);
  });

  it("words an effect and prints a p-value", () => {
    expect(effectLabel(0.05)).toBe("negligible");
    expect(effectLabel(0.14)).toBe("small");
    expect(effectLabel(0.6)).toBe("large");
    expect(formatP(0.0004)).toBe("< 0.001");
    expect(formatP(0.031)).toBe("= 0.031");
  });
});

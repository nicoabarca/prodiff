import { describe, expect, it } from "vitest";
import type { LitPath } from "$lib/dfg/utils/fold";
import { light } from "$lib/dfg/utils/light";

const path = (...ids: string[]): LitPath => ({ nodes: new Set(ids), edges: new Set() });

describe("light", () => {
  const variant = path("0", "2", "3", "1");
  const finding = path("2");
  const hover = path("3");

  it("lights a Variant's whole path over a pointed finding and a hover", () => {
    expect(light({ variant, finding, hover })).toBe(variant);
  });

  it("lights a pointed finding over a hover", () => {
    expect(light({ variant: null, finding, hover })).toBe(finding);
  });

  it("falls back to the hover, and to nothing", () => {
    expect(light({ hover })).toBe(hover);
    expect(light({ variant: null, finding: null })).toBeNull();
  });
});

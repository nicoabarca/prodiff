import { describe, expect, it } from "vitest";
import { selector } from "$lib/tour/utils/selector";

describe("selector", () => {
  it("names an anchor, and its key when there is one", () => {
    expect(selector([{ anchor: "filter-editor" }])).toBe('[data-tour="filter-editor"]');
    expect(selector([{ anchor: "group-card", key: "Slow cases" }])).toBe(
      '[data-tour="group-card"][data-tour-key="Slow cases"]'
    );
  });

  it("nests a path outermost first", () => {
    expect(selector([{ anchor: "group-card", key: "A" }, { anchor: "apply-group" }])).toBe(
      '[data-tour="group-card"][data-tour-key="A"] [data-tour="apply-group"]'
    );
  });

  it("escapes quotes in a key", () => {
    expect(selector([{ anchor: "group-card", key: 'say "hi"' }])).toBe(
      '[data-tour="group-card"][data-tour-key="say \\"hi\\""]'
    );
  });
});

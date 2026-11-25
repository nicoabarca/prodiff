import { describe, expect, it } from "vitest";
import { MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH, nodeSize, type Measure } from "$lib/tree/utils/node-size";

// Every glyph 8px wide, whatever the font.
const measure: Measure = (text) => text.length * 8;

describe("nodeSize", () => {
  it("keeps a node with little to print at the minimum", () => {
    const size = nodeSize({ label: "Decide", total: null, counts: ["380"], figures: [] }, measure);
    expect(size).toEqual({ width: MIN_WIDTH, height: MIN_HEIGHT });
  });

  it("widens the node to fit a row of shared counts", () => {
    const counts = ["66.9K (83.5%)", "13.2K (16.5%)"];
    const size = nodeSize({ label: "Check", total: "80.1K", counts, figures: [] }, measure);
    const row = (counts[0].length + counts[1].length) * 8 + 4;
    expect(size.width).toBeGreaterThanOrEqual(row + 18);
    expect(size.width).toBeLessThanOrEqual(MAX_WIDTH);
  });

  it("stops at the maximum width and grows taller as the name wraps", () => {
    const label = "Examine thoroughly and send the case to a second reviewer for approval";
    const short = nodeSize({ label: "Examine", total: null, counts: ["1"], figures: ["4d"] }, measure);
    const long = nodeSize({ label, total: null, counts: ["1"], figures: ["4d"] }, measure);
    expect(long.width).toBe(MAX_WIDTH);
    expect(long.height).toBeGreaterThan(short.height);
  });

  it("counts a word too long for one line as the lines it breaks into", () => {
    const word = "Notifyexternalcompliancedepartmentaboutunresolvedpaymentdiscrepancy";
    const spaced = nodeSize({ label: "Notify", total: null, counts: ["1"], figures: ["4d"] }, measure);
    const unbroken = nodeSize({ label: word, total: null, counts: ["1"], figures: ["4d"] }, measure);
    expect(unbroken.width).toBe(MAX_WIDTH);
    expect(unbroken.height).toBeGreaterThan(spaced.height);
  });
});

import { describe, expect, it } from "vitest";
import { emphasized, faded } from "$lib/dfg/utils/emphasis";

const ids = ["a", "b"];
const onlyA = { a: { cases: 2, events: 2 }, b: { cases: 0, events: 0 } };
const both = { a: { cases: 2, events: 2 }, b: { cases: 1, events: 1 } };

describe("emphasized", () => {
  it("keeps everything under All", () => {
    expect(emphasized(onlyA, "all", ids)).toBe(true);
  });

  it("keeps what every Group reaches under Shared", () => {
    expect(emphasized(both, "shared", ids)).toBe(true);
    expect(emphasized(onlyA, "shared", ids)).toBe(false);
  });

  it("keeps what one Group reaches under its id", () => {
    expect(emphasized(onlyA, "a", ids)).toBe(true);
    expect(emphasized(onlyA, "b", ids)).toBe(false);
  });

  it("fades nothing for a Group no longer compared", () => {
    expect(emphasized(onlyA, "gone", ids)).toBe(true);
  });
});

describe("faded", () => {
  const view = { emphasis: "all" as const, findingsOnly: true };

  it("fades a place without a finding only while findings alone are asked for", () => {
    expect(faded({ counts: both, finding: false }, view, ids)).toBe(true);
    expect(faded({ counts: both, finding: true }, view, ids)).toBe(false);
    expect(faded({ counts: both, finding: false }, { ...view, findingsOnly: false }, ids)).toBe(
      false
    );
  });

  it("fades a place outside the Group focused on, finding or not", () => {
    expect(
      faded({ counts: onlyA, finding: true }, { emphasis: "b", findingsOnly: false }, ids)
    ).toBe(true);
  });
});

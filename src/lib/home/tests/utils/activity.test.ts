import { describe, expect, it } from "vitest";
import { activityBars } from "$lib/home/utils/activity";

const days = (cases: number[]) => cases.map((value, index) => ({ dayMs: index, cases: value }));

describe("activityBars", () => {
  it("keeps one bar per day when there are fewer days than bars", () => {
    expect(activityBars(days([1, 2, 4]))).toEqual([25, 50, 100]);
  });

  it("folds days into bars by their mean", () => {
    expect(activityBars(days([2, 2, 4, 4]), 2)).toEqual([50, 100]);
  });

  it("keeps a sliver for a quiet bar and nothing for an empty one", () => {
    expect(activityBars(days([0, 1, 100]))).toEqual([0, 6, 100]);
  });

  it("returns nothing for an empty log", () => {
    expect(activityBars([])).toEqual([]);
  });
});

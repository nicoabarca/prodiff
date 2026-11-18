import { expect, test } from "vitest";
import type { BoxStats } from "$lib/analysis/types";
import {
  dotOffsets,
  fullDomain,
  outlierLabels,
  symlogConstant,
  whiskerDomain
} from "$lib/analysis/utils/box-plot";

function box(overrides: Partial<BoxStats> = {}): BoxStats {
  return {
    min: 0,
    q1: 10,
    median: 20,
    q3: 30,
    max: 100,
    whiskerLow: 0,
    whiskerHigh: 60,
    outliersLow: 0,
    outliersHigh: 0,
    ...overrides
  };
}

const format = (value: number) => `${value}s`;

test("labels the upper end alone", () => {
  expect(outlierLabels(box({ outliersHigh: 12 }), format, String)).toEqual({
    high: { text: "+12 · 100s", tooltip: "12 values above 60s, max is 100s" },
    low: null
  });
});

test("labels the lower end alone", () => {
  expect(outlierLabels(box({ min: -5, whiskerLow: 2, outliersLow: 4 }), format, String)).toEqual({
    high: null,
    low: { text: "-5s · +4", tooltip: "4 values below 2s, min is -5s" }
  });
});

test("labels both ends", () => {
  const labels = outlierLabels(
    box({ min: -5, whiskerLow: 2, outliersLow: 3, outliersHigh: 7 }),
    format,
    String
  );
  expect(labels.high?.text).toBe("+7 · 100s");
  expect(labels.low?.text).toBe("-5s · +3");
});

test("labels nothing without outliers", () => {
  expect(outlierLabels(box(), format, String)).toEqual({ high: null, low: null });
});

test("says value for a single outlier", () => {
  const labels = outlierLabels(box({ outliersHigh: 1, outliersLow: 1 }), format, String);
  expect(labels.high?.tooltip).toBe("1 value above 60s, max is 100s");
  expect(labels.low?.tooltip).toBe("1 value below 0s, min is 0s");
});

test("spans the whiskers or every value across Groups", () => {
  const rows = [
    box({ min: -4, whiskerLow: 1, whiskerHigh: 50, max: 90 }),
    box({ min: 2, whiskerLow: 3, whiskerHigh: 70, max: 300 })
  ];
  expect(whiskerDomain(rows)).toEqual([1, 70]);
  expect(fullDomain(rows)).toEqual([-4, 300]);
});

test("takes a positive constant as given", () => {
  expect(symlogConstant([box()], 0, 80, 5)).toBe(5);
});

test("falls back to the widest IQR", () => {
  expect(symlogConstant([box({ q1: 0, q3: 2 }), box({ q1: 1, q3: 5 })], 0, 80)).toBe(4);
});

test("falls back to an eighth of the domain when no box has spread", () => {
  expect(symlogConstant([box({ q1: 3, q3: 3 })], 0, 80)).toBe(10);
});

test("spreads dots over the middle of the band", () => {
  const offsets = dotOffsets(3);
  expect(offsets).toHaveLength(3);
  for (const offset of offsets) {
    expect(offset).toBeGreaterThanOrEqual(0.2);
    expect(offset).toBeLessThanOrEqual(0.8);
  }
  expect(new Set(offsets).size).toBe(3);
});

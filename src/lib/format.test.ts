import { expect, test } from "vitest";
import { formatCompact, formatDuration, formatDurationParts } from "$lib/format";

test("a compact count rounds to one decimal of its largest unit", () => {
  expect(formatCompact(999)).toBe("999");
  expect(formatCompact(10_000)).toBe("10K");
  expect(formatCompact(10_500)).toBe("10.5K");
  expect(formatCompact(10_550)).toBe("10.6K");
  expect(formatCompact(66_656)).toBe("66.7K");
  expect(formatCompact(1_250_000)).toBe("1.3M");
});

test("a duration reads as its two largest units", () => {
  expect(formatDuration(null)).toBe("—");
  expect(formatDuration(0)).toBe("0s");
  expect(formatDuration(48 * 60_000 + 48_000)).toBe("48m 48s");
  expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000)).toBe("2d 3h");
});

test("a negative duration keeps its sign and its magnitude", () => {
  expect(formatDuration(-2_156_100)).toBe("-35m 56s");
  expect(formatDuration(-59_900)).toBe("-1m 0s");
  expect(formatDuration(-400)).toBe("0s");
  expect(formatDurationParts(-3_661_000)).toBe("-1h 1m 1s");
});

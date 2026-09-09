import { expect, test } from "vitest";
import { formatDuration, formatDurationParts } from "$lib/format";

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

/**
 * A timestamp format that parses the wrong way round fails silently: the import
 * succeeds, every date is real, and only the ordering of the process is quietly
 * wrong. These tests pin the tokenizer and the parser that the mapping step
 * shows its evidence with.
 */
import { describe, expect, it } from "vitest";
import {
  coverage,
  FORMAT_CATALOG,
  inferFormat,
  parseWithFormat,
  tokenize
} from "$lib/event-log/utils/timestamp-format";

function parsed(value: string, pattern: string): string {
  const result = parseWithFormat(value, pattern);
  expect(result.ok, `${value} should parse as ${pattern}`).toBe(true);
  return result.ok ? result.iso : "";
}

function rejected(value: string, pattern: string) {
  expect(parseWithFormat(value, pattern).ok, `${value} should not parse as ${pattern}`).toBe(false);
}

describe("tokenize", () => {
  it("splits a pattern into tokens and literals", () => {
    const pieces = tokenize("DD/MM/YYYY");
    expect(pieces.map((p) => (p.kind === "token" ? p.name : p.text))).toEqual([
      "DD",
      "/",
      "MM",
      "/",
      "YYYY"
    ]);
  });

  it("is greedy, longest first", () => {
    const pieces = tokenize("YYYY");
    expect(pieces.length).toBe(1);
    expect(pieces[0].kind === "token" && pieces[0].name).toBe("YYYY");
  });

  it("reads %% as an escaped percent", () => {
    const pieces = tokenize("%%YYYY");
    expect(pieces[0].kind === "literal" && pieces[0].text).toBe("%");
  });
});

describe("parseWithFormat", () => {
  it("round trips the catalog shapes", () => {
    expect(parsed("2024-01-15 09:30:00", "YYYY-MM-DD HH:mm:ss")).toBe("2024-01-15 09:30:00");
    expect(parsed("2024-01-15T09:30:00", "YYYY-MM-DDTHH:mm:ss")).toBe("2024-01-15 09:30:00");
    expect(parsed("2024-01-15", "YYYY-MM-DD")).toBe("2024-01-15 00:00:00");
    expect(parsed("15/01/2024 09:30", "DD/MM/YYYY HH:mm")).toBe("2024-01-15 09:30:00");
    expect(parsed("15.01.2024 09:30:00", "DD.MM.YYYY HH:mm:ss")).toBe("2024-01-15 09:30:00");
    expect(parsed("1/1/2024 9:05", "D/M/YYYY H:mm")).toBe("2024-01-01 09:05:00");
  });

  it("keeps milliseconds in the value the user is shown back", () => {
    expect(parsed("2024-01-15 09:30:00.250", "YYYY-MM-DD HH:mm:ss.SSS")).toBe(
      "2024-01-15 09:30:00.250"
    );
  });

  it("reads AM/PM, including the two hours that trip naive implementations", () => {
    expect(parsed("15/01/2024 01:30:00 PM", "DD/MM/YYYY hh:mm:ss A")).toBe("2024-01-15 13:30:00");
    expect(parsed("15/01/2024 12:30:00 AM", "DD/MM/YYYY hh:mm:ss A")).toBe("2024-01-15 00:30:00");
    expect(parsed("15/01/2024 12:30:00 PM", "DD/MM/YYYY hh:mm:ss A")).toBe("2024-01-15 12:30:00");
  });

  it("shifts a zoned instant to UTC, matching what the import writes", () => {
    expect(parsed("2024-01-15T09:30:00Z", "YYYY-MM-DDTHH:mm:ssZ")).toBe("2024-01-15 09:30:00");
    expect(parsed("2024-01-15T09:30:00+03:00", "YYYY-MM-DDTHH:mm:ssZ")).toBe("2024-01-15 06:30:00");
    expect(parsed("2024-01-15T09:30:00-0500", "YYYY-MM-DDTHH:mm:ssZ")).toBe("2024-01-15 14:30:00");
  });

  it("reads a two-digit year against the century window", () => {
    expect(parsed("15/01/99", "DD/MM/YY")).toBe("1999-01-15 00:00:00");
    expect(parsed("15/01/24", "DD/MM/YY")).toBe("2024-01-15 00:00:00");
  });

  it("rejects what it cannot read exactly", () => {
    // The whole value has to be consumed: a trailing time is not a bare date.
    rejected("2024-01-15 09:30:00", "YYYY-MM-DD");
    // Fixed-width tokens do not accept a short field.
    rejected("2024-1-15", "YYYY-MM-DD");
    // Literals have to match exactly.
    rejected("15-01-2024", "DD/MM/YYYY");
    // Field ranges are checked.
    rejected("15/13/2024", "DD/MM/YYYY");
    rejected("2024-01-15 25:00:00", "YYYY-MM-DD HH:mm:ss");
    // A day that does not exist in that month is rejected rather than rolled over.
    rejected("31/02/2024", "DD/MM/YYYY");
    // 12-hour clock has no hour zero.
    rejected("15/01/2024 00:30:00 AM", "DD/MM/YYYY hh:mm:ss A");
    rejected("", "YYYY-MM-DD");
    rejected("not a date", "YYYY-MM-DD");
  });
});

describe("FORMAT_CATALOG", () => {
  it("offers only patterns the parser itself accepts", () => {
    for (const pattern of FORMAT_CATALOG) {
      expect(
        tokenize(pattern).some((p) => p.kind === "token"),
        `${pattern} has no tokens`
      ).toBe(true);
    }
  });
});

describe("inferFormat", () => {
  it("settles an unambiguous sample", () => {
    const iso = inferFormat(["2024-01-15 09:30:00", "2024-02-01 17:00:00"]);
    expect(iso.pattern).toBe("YYYY-MM-DD HH:mm:ss");
    expect(iso.rivals).toEqual([]);
    expect(iso.matched).toBe(2);
    expect(iso.total).toBe(2);
  });

  it("lets a day past the 12th settle the day/month order", () => {
    const european = inferFormat(["15/01/2024 09:30:00", "28/02/2024 17:00:00"]);
    expect(european.pattern).toBe("DD/MM/YYYY HH:mm:ss");
    expect(european.rivals).toEqual([]);
  });

  it("keeps the rival reading when nothing distinguishes the two orders", () => {
    const ambiguous = inferFormat(["05/03/2024", "07/09/2024"]);
    expect(ambiguous.pattern).toBe("DD/MM/YYYY");
    expect(ambiguous.rivals, "the other reading must be kept").toContain("MM/DD/YYYY");
  });

  it("finds no format for a column of mixed shapes", () => {
    const mixed = inferFormat(["2024-01-15", "15/01/2024", "Jan 15 2024"]);
    expect(mixed.pattern).toBe(null);
    expect(mixed.rivals).toEqual([]);
  });

  it("treats nothing to go on as not the same as a mismatch", () => {
    const empty = inferFormat(["", "   "]);
    expect(empty.pattern).toBe(null);
    expect(empty.total).toBe(0);
  });

  it("does not let blank cells sink a pattern", () => {
    const gapped = inferFormat(["2024-01-15", "", "2024-02-01"]);
    expect(gapped.pattern).toBe("YYYY-MM-DD");
    expect(gapped.total).toBe(2);
    expect(gapped.matched).toBe(2);
  });

  it("disqualifies a pattern on one stray value", () => {
    const partial = inferFormat(["15/01/2024", "13/02/2024", "2024-03-01"]);
    expect(partial.pattern).toBe(null);
  });
});

describe("coverage", () => {
  it("counts matches and names the first failure", () => {
    const stats = coverage(["15/01/2024", "05-03-2024", "20/01/2024"], "DD/MM/YYYY");
    expect(stats.matched).toBe(2);
    expect(stats.total).toBe(3);
    expect(stats.firstFailure).toEqual({ value: "05-03-2024", row: 1 });
  });

  it("reports no failure on a clean column", () => {
    const clean = coverage(["15/01/2024"], "DD/MM/YYYY");
    expect(clean.firstFailure).toBe(null);
  });
});

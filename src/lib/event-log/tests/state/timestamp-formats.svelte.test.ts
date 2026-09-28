import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResponseTimestampColumnReport } from "$lib/event-log/invokers/types";
import { TimestampFormats } from "$lib/event-log/state/timestamp-formats.svelte";

function report(column: string, pattern: string, failed = 0): ResponseTimestampColumnReport {
  return {
    column,
    rows: 2,
    missing: 0,
    best: pattern,
    coverage: [{ pattern, failed }],
    deviants: failed ? ["bad"] : []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("TimestampFormats", () => {
  it("ignores a stale format check", async () => {
    vi.useFakeTimers();
    const first = deferred<ResponseTimestampColumnReport[]>();
    const second = deferred<ResponseTimestampColumnReport[]>();
    const analyze = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const formats = new TimestampFormats({ analyze, debounce: 0 });

    formats.sync("log.csv", [{ column: "ts", pattern: "YYYY-MM-DD" }]);
    await vi.runOnlyPendingTimersAsync();
    formats.sync("log.csv", [{ column: "ts", pattern: "DD/MM/YYYY" }]);
    await vi.runOnlyPendingTimersAsync();

    first.resolve([report("ts", "YYYY-MM-DD")]);
    await Promise.resolve();
    expect(formats.isChecking("ts")).toBe(true);
    expect(formats.checks.ts).toBeUndefined();

    second.resolve([report("ts", "DD/MM/YYYY")]);
    await Promise.resolve();
    expect(formats.isChecking("ts")).toBe(false);
    expect(formats.checks.ts.pattern).toBe("DD/MM/YYYY");
  });

  it("checks custom patterns alongside catalog inference", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn().mockResolvedValue([]);
    const formats = new TimestampFormats({ analyze, debounce: 0 });

    formats.sync("log.csv", [
      { column: "inferred", pattern: null },
      { column: "custom", pattern: "YYYY at HH" }
    ]);
    await vi.runOnlyPendingTimersAsync();

    expect(analyze.mock.calls[0][2]).toContain("YYYY at HH");
  });

  it("carries an explicit choice to later temporal columns", () => {
    const formats = new TimestampFormats({ analyze: vi.fn() });
    formats.choose("complete", "DD/MM/YYYY");
    formats.sync("log.csv", [
      { column: "complete", pattern: "DD/MM/YYYY" },
      { column: "start", pattern: "YYYY-MM-DD" }
    ]);

    expect(formats.patterns.start).toBe("DD/MM/YYYY");
  });

  it("leaves a column the file stores as a timestamp without a pattern or a check", async () => {
    vi.useFakeTimers();
    const analyze = vi.fn().mockResolvedValue([]);
    const formats = new TimestampFormats({ analyze, debounce: 0 });
    formats.seed(
      [
        { name: "time:timestamp", dtype: "datetime" },
        { name: "due", dtype: "string" }
      ],
      [["2024-03-15 09:00:00", "15/03/2024"]]
    );

    formats.sync("log.xes", [
      { column: "time:timestamp", pattern: null },
      { column: "due", pattern: "DD/MM/YYYY" }
    ]);
    await vi.runOnlyPendingTimersAsync();

    expect(formats.isTyped("time:timestamp")).toBe(true);
    expect(formats.patterns["time:timestamp"]).toBeUndefined();
    expect(formats.isUnresolved("time:timestamp", "")).toBe(false);
    expect(analyze.mock.calls[0][1]).toEqual(["due"]);
  });

  it("applies a shared pattern only to columns that need one", () => {
    const formats = new TimestampFormats({ analyze: vi.fn() });
    formats.seed(
      [
        { name: "time:timestamp", dtype: "datetime" },
        { name: "due", dtype: "string" }
      ],
      []
    );

    formats.applyTo(["time:timestamp", "due"], "DD/MM/YYYY");

    expect(formats.patterns).toEqual({ due: "DD/MM/YYYY" });
  });
});

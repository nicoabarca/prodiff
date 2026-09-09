import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResponseCaseColumnViolation } from "$lib/event-log/invokers/types";
import { CaseColumnChecks } from "$lib/event-log/state/case-columns.svelte";

function violation(column: string, cases = 1): ResponseCaseColumnViolation {
  return { column, cases, exampleCase: "c1", exampleValues: ["North", "South"] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("CaseColumnChecks", () => {
  it("reports the violating column and holds the user back", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockResolvedValue([violation("region", 4)]);
    const checks = new CaseColumnChecks({ check, debounce: 0 });

    checks.sync("log.csv", "case", ["region"]);
    await vi.runOnlyPendingTimersAsync();

    expect(check).toHaveBeenCalledWith("log.csv", "case", ["region"]);
    expect(checks.violation("region")?.cases).toBe(4);
    expect(checks.settled).toBe(false);
  });

  it("settles when nothing violates", async () => {
    vi.useFakeTimers();
    const checks = new CaseColumnChecks({ check: vi.fn().mockResolvedValue([]), debounce: 0 });

    checks.sync("log.csv", "case", ["region"]);
    await vi.runOnlyPendingTimersAsync();

    expect(checks.violation("region")).toBeNull();
    expect(checks.settled).toBe(true);
  });

  it("checks nothing when no column asks to be constant", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockResolvedValue([violation("region")]);
    const checks = new CaseColumnChecks({ check, debounce: 0 });

    checks.sync("log.csv", "case", ["region"]);
    await vi.runOnlyPendingTimersAsync();
    checks.sync("log.csv", "case", []);
    await vi.runOnlyPendingTimersAsync();

    expect(check).toHaveBeenCalledTimes(1);
    expect(checks.violations).toEqual([]);
    expect(checks.settled).toBe(true);
  });

  it("is still checking until the answer arrives", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockReturnValue(new Promise(() => {}));
    const checks = new CaseColumnChecks({ check, debounce: 0 });

    checks.sync("log.csv", "case", ["region"]);
    expect(checks.settled).toBe(false);
    await vi.runOnlyPendingTimersAsync();
    expect(checks.checking).toBe(true);
    expect(checks.settled).toBe(false);
  });

  it("ignores a stale answer", async () => {
    vi.useFakeTimers();
    const first = deferred<ResponseCaseColumnViolation[]>();
    const second = deferred<ResponseCaseColumnViolation[]>();
    const check = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const checks = new CaseColumnChecks({ check, debounce: 0 });

    checks.sync("log.csv", "case", ["region"]);
    await vi.runOnlyPendingTimersAsync();
    checks.sync("log.csv", "case", ["region", "segment"]);
    await vi.runOnlyPendingTimersAsync();

    first.resolve([violation("region", 9)]);
    await Promise.resolve();
    expect(checks.violations).toEqual([]);
    expect(checks.checking).toBe(true);

    second.resolve([violation("segment")]);
    await Promise.resolve();
    expect(checks.violation("segment")).not.toBeNull();
    expect(checks.violation("region")).toBeNull();
  });

  it("does not hold the user back when the check itself fails", async () => {
    vi.useFakeTimers();
    const check = vi.fn().mockRejectedValue(new Error("no such file"));
    const checks = new CaseColumnChecks({ check, debounce: 0 });

    checks.sync("log.csv", "case", ["region"]);
    await vi.runOnlyPendingTimersAsync();

    expect(checks.error).toContain("no such file");
    expect(checks.settled).toBe(true);
  });
});

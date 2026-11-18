import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FitHarness from "$lib/components/fit/fit-harness.test.svelte";

let overflowing = false;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() =>
    overflowing ? 240 : 100
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  overflowing = false;
});

describe("Fit", () => {
  it("shows the whole text and takes no tab stop when it fits", () => {
    render(FitHarness, { text: "Dismissed" });
    const text = screen.getByText("Dismissed");
    expect(text.getAttribute("tabindex")).toBe("-1");
  });

  it("becomes a tab stop when its text is cut", () => {
    overflowing = true;
    render(FitHarness, { text: "High amount per day, fined in 2023" });
    const text = screen.getByText("High amount per day, fined in 2023");
    expect(text.getAttribute("tabindex")).toBe("0");
  });

  it("leaves the tab stop to its control when not focusable", () => {
    overflowing = true;
    render(FitHarness, { text: "High amount per day, fined in 2023", focusable: false });
    const text = screen.getByText("High amount per day, fined in 2023");
    expect(text.getAttribute("tabindex")).toBe("-1");
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
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

  it("shows its whole text in the tooltip when the pointer rests on it while cut", async () => {
    overflowing = true;
    render(FitHarness, { text: "High amount per day, fined in 2023", focusable: false });
    const text = screen.getByText("High amount per day, fined in 2023");
    await fireEvent.pointerEnter(text);
    await waitFor(() => expect(text.getAttribute("aria-describedby")).not.toBeNull());
    const tip = document.getElementById(text.getAttribute("aria-describedby")!);
    expect(tip).toHaveTextContent("High amount per day, fined in 2023");
  });

  it("shows no tooltip for text that fits", async () => {
    render(FitHarness, { text: "Dismissed" });
    await fireEvent.pointerEnter(screen.getByText("Dismissed"));
    await new Promise((done) => setTimeout(done, 300));
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
  });

  it("leaves the tab stop to its control when not focusable", () => {
    overflowing = true;
    render(FitHarness, { text: "High amount per day, fined in 2023", focusable: false });
    const text = screen.getByText("High amount per day, fined in 2023");
    expect(text.getAttribute("tabindex")).toBe("-1");
  });
});

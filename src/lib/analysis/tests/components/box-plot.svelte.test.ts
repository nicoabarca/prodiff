import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import BoxPlot from "$lib/analysis/components/box-plot.svelte";
import WithTooltips from "$lib/analysis/tests/components/with-tooltips.svelte";
import type { BoxStats } from "$lib/analysis/types";
import { formatDuration, formatNumber } from "$lib/format";

vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {}
    }) as unknown as MediaQueryList;
});

const HOUR = 3_600_000;

const tailed: BoxStats = {
  min: 0,
  q1: 0.2 * HOUR,
  median: 0.4 * HOUR,
  q3: 0.6 * HOUR,
  max: 259_200_000,
  whiskerLow: 0,
  whiskerHigh: HOUR,
  outliersLow: 0,
  outliersHigh: 12
};

const tidy: BoxStats = { ...tailed, max: 0.9 * HOUR, whiskerHigh: 0.9 * HOUR, outliersHigh: 0 };

const groups = [
  { id: "a", name: "Group A", color: "red" },
  { id: "b", name: "Group B", color: "blue" }
];

let target: HTMLElement;
let app: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  target = document.createElement("div");
  document.body.append(target);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
  vi.unstubAllGlobals();
});

function render(boxes: Record<string, BoxStats | null>): void {
  app = mount(WithTooltips, {
    target,
    props: {
      component: BoxPlot,
      props: { boxes, groups, format: formatDuration, formatCount: formatNumber }
    }
  });
  flushSync();
}

function triggers(): string[] {
  return [...target.querySelectorAll("[data-slot=tooltip-trigger]")].map(
    (element) => element.textContent?.trim() ?? ""
  );
}

test("labels only the Group with outliers, and prints no sentence", () => {
  render({ a: tailed, b: tidy });
  expect(target.textContent).not.toContain("not plotted");
  expect(triggers()).toEqual(["+12 · 3d 0h"]);
});

test("still says when every value is the same", () => {
  const point = { ...tidy, min: HOUR, q1: HOUR, median: HOUR, q3: HOUR, max: HOUR };
  render({ a: { ...point, whiskerLow: HOUR, whiskerHigh: HOUR }, b: null });
  expect(target.textContent).toContain("All values are");
});

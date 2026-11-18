import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import BoxPlotDialog from "$lib/analysis/components/box-plot-dialog.svelte";
import WithTooltips from "$lib/analysis/tests/components/with-tooltips.svelte";
import type { Outliers } from "$lib/analysis/types";
import type { BoxRow } from "$lib/analysis/utils/box-plot";

vi.hoisted(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {}
    }) as unknown as MediaQueryList;
});

const rows: BoxRow[] = [
  {
    id: "a",
    name: "Group A",
    color: "red",
    min: -50,
    q1: 10,
    median: 20,
    q3: 30,
    max: 900,
    whiskerLow: 0,
    whiskerHigh: 60,
    outliersLow: 1,
    outliersHigh: 2
  }
];

type Load = () => Promise<Record<string, Outliers>>;

function deferred() {
  let resolve!: (value: Record<string, Outliers>) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<Record<string, Outliers>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

let app: ReturnType<typeof mount> | null = null;
let target: HTMLElement;

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

function render(load: Load) {
  const props = $state({
    open: true,
    title: "Cost",
    rows,
    load,
    format: String,
    formatCount: String
  });
  app = mount(WithTooltips, { target, props: { component: BoxPlotDialog, props } });
  flushSync();
  return props;
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
};

const spinner = () => document.body.querySelector("[aria-label='Loading outliers']");
const retry = () =>
  [...document.body.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Retry"
  );
const dots = () => document.body.querySelectorAll("circle[r='2.5']").length;

test("loads while the promise is pending", () => {
  const load = vi.fn<Load>(() => deferred().promise);
  render(load);
  expect(load).toHaveBeenCalledTimes(1);
  expect(spinner()).not.toBeNull();
  expect(document.body.textContent).toContain("Group A");
});

test("shows the error and retries the same load", async () => {
  const first = deferred();
  const load = vi.fn<Load>().mockReturnValueOnce(first.promise).mockReturnValue(deferred().promise);
  render(load);
  first.reject("Group file missing");
  await settle();
  expect(document.body.textContent).toContain("Group file missing");
  retry()!.click();
  flushSync();
  expect(load).toHaveBeenCalledTimes(2);
  expect(spinner()).not.toBeNull();
});

test("drops a response a later open has overtaken", async () => {
  const first = deferred();
  const second = deferred();
  const load = vi.fn<Load>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const props = render(load);
  props.open = false;
  flushSync();
  props.open = true;
  flushSync();
  expect(load).toHaveBeenCalledTimes(2);

  second.resolve({ a: { low: [-50], high: [700, 900] } });
  await settle();
  first.reject("stale");
  await settle();

  expect(spinner()).toBeNull();
  expect(document.body.textContent).not.toContain("stale");
  expect(dots()).toBe(3);
});

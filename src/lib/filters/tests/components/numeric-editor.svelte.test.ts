import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Project } from "$lib/event-log/types";
import type { Filter } from "$lib/filters/kind/filter";
import type { NumericFilter } from "$lib/filters/kind/numeric";
import NumericEditor from "$lib/filters/components/editors/numeric-editor.svelte";
import { numericPercentiles } from "$lib/filters/invokers/numeric-percentiles";

vi.mock("$lib/filters/invokers/numeric-percentiles", () => ({ numericPercentiles: vi.fn() }));

const project = {
  id: "p",
  name: "p",
  columns: [
    { name: "monto", role: "other", scope: "case", type: "float", caseResolution: "first" },
    { name: "puntos", role: "other", scope: "case", type: "integer", caseResolution: "first" }
  ],
  hiddenColumns: []
} as unknown as Project;

const POINTS = [10, 20, 20, 30, 100];

let target: HTMLElement;
let app: ReturnType<typeof mount> | null = null;
let draft: Filter | null;

beforeEach(() => {
  vi.mocked(numericPercentiles).mockReset();
  vi.mocked(numericPercentiles).mockResolvedValue(POINTS);
  target = document.createElement("div");
  document.body.append(target);
  draft = null;
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

async function open(initial: NumericFilter): Promise<void> {
  app = mount(NumericEditor, {
    target,
    props: { project, initial, color: "red", ondraft: (next: Filter | null) => (draft = next) }
  });
  flushSync();
  await vi.waitFor(() => {
    flushSync();
    expect(draft).not.toBeNull();
  });
}

function input(id: string): HTMLInputElement {
  return target.querySelector<HTMLInputElement>(`#${id}`)!;
}

function type(id: string, value: string): void {
  input(id).value = value;
  input(id).dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

const below = (max: number | null = null): NumericFilter => ({
  kind: "numeric",
  column: "monto",
  mode: "below",
  min: null,
  max
});

test("a typed bound reaches the draft", async () => {
  await open(below());
  type("filter-max", "49.99");
  expect(draft).toMatchObject({ mode: "below", max: 49.99 });
});

test("clearing a bound leaves that side unbounded", async () => {
  await open(below(50));
  type("filter-max", "");
  expect(draft).toMatchObject({ max: null });
});

test("the strip colors what the bound keeps and says how much", async () => {
  await open(below());
  type("filter-max", "20");
  await vi.waitFor(() => {
    flushSync();
    const kept = target.querySelector<HTMLElement>("[data-slot=percentile-kept]")!;
    expect(kept.style.left).toBe("0%");
    expect(kept.style.width).toBe("50%");
  });
  expect(target.textContent).toContain("Keeps 50% of cases");
});

test("the strip labels values and shares", async () => {
  await open(below());
  const strip = target.querySelector("[data-slot=percentile-strip]")!.parentElement!;
  expect(strip.textContent).toContain("100");
  expect(strip.textContent).toContain("25%");
});

test("hovering names the value there without rounding its share up to 100%", async () => {
  const points = [...Array<number>(996).fill(1), ...Array<number>(5).fill(4000)];
  vi.mocked(numericPercentiles).mockResolvedValue(points);
  await open(below());
  const strip = target.querySelector<HTMLElement>("[data-slot=percentile-strip]")!;
  strip.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
  strip.dispatchEvent(new MouseEvent("pointermove", { clientX: 500, bubbles: true }));
  flushSync();
  expect(target.textContent).toContain("99.5% of cases at or below 1");
  strip.dispatchEvent(new MouseEvent("pointerleave"));
  flushSync();
  expect(target.textContent).not.toContain("99.5% of cases");
});

test("two bounds on one value draw without a duplicate key", async () => {
  await open({ kind: "numeric", column: "monto", mode: "between", min: 30, max: 30 });
  expect(target.querySelectorAll("[data-slot=percentile-rule]")).toHaveLength(2);
});

test("no draft is emitted until the column's range is known", async () => {
  vi.mocked(numericPercentiles).mockReturnValue(new Promise(() => {}));
  app = mount(NumericEditor, {
    target,
    props: {
      project,
      initial: below(50),
      color: "red",
      ondraft: (next: Filter | null) => (draft = next)
    }
  });
  flushSync();
  expect(draft).toBeNull();
});

test("a bound past the data is drafted at the data's edge and corrected on commit", async () => {
  await open(below());
  type("filter-max", "99999");
  expect(draft).toMatchObject({ max: 100 });
  expect(input("filter-max").value).toBe("99999");

  input("filter-max").dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
  expect(input("filter-max").value).toBe("100");
});

test("the input carries the data's range", async () => {
  await open(below());
  expect(input("filter-max").min).toBe("10");
  expect(input("filter-max").max).toBe("100");
  expect(input("filter-max").step).toBe("any");
});

test("an inverted range drafts nothing", async () => {
  await open({ kind: "numeric", column: "monto", mode: "between", min: 20, max: 30 });
  type("filter-min", "40");
  expect(draft).toBeNull();
});

test("a failed range read does not block the filter", async () => {
  vi.mocked(numericPercentiles).mockRejectedValue("no such column");
  await open(below());
  type("filter-max", "99999");
  expect(draft).toMatchObject({ max: 99999 });
  expect(target.textContent).toContain("no such column");
});

test("a column with no values does not bound the input", async () => {
  vi.mocked(numericPercentiles).mockResolvedValue([]);
  await open(below());
  type("filter-max", "7");
  expect(draft).toMatchObject({ max: 7 });
  expect(input("filter-max").hasAttribute("max")).toBe(false);
});

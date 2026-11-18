import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import VariantSteps from "$lib/tree/components/variant-steps.svelte";

let target: HTMLElement;
let app: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  target = document.createElement("div");
  document.body.appendChild(target);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

function render(labels: string[]) {
  const steps = labels.map((label, index) => ({ id: index + 1, label, color: "inherit" }));
  app = mount(VariantSteps, { target, props: { steps } });
  flushSync();
}

const shownLabels = () =>
  [...target.querySelectorAll("li")]
    .map((li) => li.querySelector("span:nth-child(2) > span")?.textContent?.trim())
    .filter((label): label is string => label !== undefined);

test("a short path lists every activity in full", () => {
  render(["Create Fine", "Send Fine", "Insert Fine Notification"]);
  expect(shownLabels()).toEqual(["Create Fine", "Send Fine", "Insert Fine Notification"]);
  expect(target.querySelector("button")).toBeNull();
});

test("a long path folds its middle and unfolds on click", () => {
  render(["a", "b", "c", "d", "e", "f", "g", "h"]);
  expect(shownLabels()).toEqual(["a", "b", "f", "g", "h"]);

  const button = target.querySelector("button") as HTMLButtonElement;
  expect(button.textContent?.trim()).toBe("3 more steps");
  button.click();
  flushSync();
  expect(shownLabels()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("an activity met earlier on the path is marked as a repeat", () => {
  render(["Create Fine", "Payment", "Payment"]);
  const marks = [...target.querySelectorAll("li")].map(
    (li) => li.querySelector('[aria-label="Repeated activity"]') !== null
  );
  expect(marks).toEqual([false, false, true]);
});

test("each activity is drawn in its step's colour", () => {
  app = mount(VariantSteps, {
    target,
    props: {
      steps: [
        { id: 1, label: "Shared", color: "var(--group-original)" },
        { id: 2, label: "Only a", color: "var(--group-2)" }
      ]
    }
  });
  flushSync();
  const colors = [...target.querySelectorAll("li span:nth-child(2) > span")].map(
    (span) => (span as HTMLElement).style.color
  );
  expect(colors).toEqual(["var(--group-original)", "var(--group-2)"]);
});

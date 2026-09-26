import { describe, expect, it } from "vitest";
import { TOURS } from "$lib/tour/tours";

const sources = import.meta.glob<string>("/src/**/*.svelte", {
  query: "?raw",
  import: "default",
  eager: true
});
const markup = Object.values(sources).join("\n");

/** Whether some component renders `data-tour={anchor}`. The sidebar renders `nav-{view}`. */
function rendered(anchor: string): boolean {
  if (markup.includes(`data-tour="${anchor}"`)) return true;
  const view = anchor.startsWith("nav-") ? anchor.slice("nav-".length) : null;
  return (
    view !== null && markup.includes('data-tour="nav-{view}"') && markup.includes(`view: "${view}"`)
  );
}

describe("Tour anchors", () => {
  const anchors = new Set(
    Object.values(TOURS).flatMap((steps) =>
      steps.flatMap((step) => (step.target ?? []).map((target) => target.anchor))
    )
  );

  it.each([...anchors])("%s is rendered somewhere", (anchor) => {
    expect(rendered(anchor)).toBe(true);
  });
});

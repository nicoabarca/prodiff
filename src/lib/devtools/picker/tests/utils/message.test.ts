import { describe, expect, it } from "vitest";
import type { ElementContext } from "$lib/devtools/picker/types";
import { formatMessage, MESSAGE_LIMIT } from "$lib/devtools/picker/utils/message";

const element = (over: Partial<ElementContext> = {}): ElementContext => ({
  tag: "button",
  source: { file: "src/lib/groups/components/compare-field.svelte", line: 42, column: 5 },
  sourceIsAncestor: false,
  components: [{ tag: "CompareField", location: { file: "src/lib/tree/components/tree-toolbar.svelte", line: 30, column: 3 } }],
  selector: 'body > button[data-tour="compare-groups"]',
  attributes: { "data-tour": "compare-groups" },
  text: "Compare",
  rect: { x: 10, y: 20, width: 120, height: 32 },
  html: "<button>Compare</button>",
  ...over
});

const base = {
  instruction: "  Make it blue  ",
  route: "/app/projects/abc/tree",
  viewport: { width: 1440, height: 900 }
};

describe("formatMessage", () => {
  it("frames a Do message and lists each element", () => {
    const { text, meta } = formatMessage({ ...base, mode: "do", elements: [element(), element({ tag: "span" })] });
    expect(meta).toEqual({
      app: "prodiff",
      mode: "do",
      from: "button · compare-field.svelte:42, span · compare-field.svelte:42",
      route: "/app/projects/abc/tree"
    });
    expect(text.split("\n")[0]).toBe("[ProDiff Do] button · compare-field.svelte:42, span · compare-field.svelte:42");
    expect(text).toContain("wants this change made");
    expect(text).toContain("## Instruction\nMake it blue\n");
    expect(text).toContain("### Element 1: <button> at src/lib/groups/components/compare-field.svelte:42:5");
    expect(text).toContain("Rendered inside: <CompareField> at src/lib/tree/components/tree-toolbar.svelte:30:3");
    expect(text).toContain('Attributes: data-tour="compare-groups"');
    expect(text).toContain("Box: x=10 y=20, 120×32 px");
    expect(text).toContain("```html\n<button>Compare</button>\n```");
    expect(text).toContain("### Element 2: <span>");
  });

  it("frames an Ask message as read-only, answered in the session", () => {
    const { text, meta } = formatMessage({ ...base, mode: "ask", elements: [element()] });
    expect(meta.mode).toBe("ask");
    expect(text.split("\n")[0]).toBe("[ProDiff Ask] button · compare-field.svelte:42");
    expect(text).toContain("Answer here in the session");
    expect(text).toContain("It is read-only");
    expect(text).toContain("## Question\nMake it blue");
  });

  it("says when the location belongs to an ancestor or is missing", () => {
    const { text } = formatMessage({
      ...base,
      mode: "do",
      elements: [element({ sourceIsAncestor: true }), element({ source: null, components: [] })]
    });
    expect(text).toContain("<button> inside markup at src/lib/groups");
    expect(text).toContain("### Element 2: <button> (no source location)");
  });

  it("shrinks element HTML to stay within the limit", () => {
    const big = "<div>" + "x".repeat(10_000) + "</div>";
    const { text } = formatMessage({ ...base, mode: "do", elements: [element({ html: big }), element({ html: big })] });
    expect(text.length).toBeLessThanOrEqual(MESSAGE_LIMIT + 200);
    expect(text).toContain("more characters]");
  });
});

import { describe, expect, it } from "vitest";
import {
  attributesOf,
  componentsOf,
  contextOf,
  crumbsOf,
  htmlOf,
  labelOf,
  selectorOf,
  textOf
} from "$lib/devtools/picker/utils/context";

type Meta = { loc: { file: string; line: number; column: number }; parent: unknown };

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

function tag(element: Element, file: string, line: number, parent: unknown = null) {
  (element as Element & { __svelte_meta: Meta }).__svelte_meta = { loc: { file, line, column: 3 }, parent };
}

describe("componentsOf", () => {
  it("lists component uses innermost first and skips blocks", () => {
    const page = { type: "component", file: "src/routes/+layout.svelte", line: 40, column: 5, parent: null, componentTag: "Page" };
    const each = { type: "each", file: "src/routes/+page.svelte", line: 12, column: 1, parent: page };
    const card = { type: "component", file: "src/routes/+page.svelte", line: 14, column: 3, parent: each, componentTag: "Card" };
    expect(componentsOf({ loc: { file: "x", line: 1, column: 1 }, parent: card } as never)).toEqual([
      { tag: "Card", location: { file: "src/routes/+page.svelte", line: 14, column: 3 } },
      { tag: "Page", location: { file: "src/routes/+layout.svelte", line: 40, column: 5 } }
    ]);
  });

  it("is empty without metadata", () => {
    expect(componentsOf(null)).toEqual([]);
  });
});

describe("selectorOf", () => {
  it("stops at the nearest id and numbers repeated tags", () => {
    const body = mount(`<main id="app"><div><span>a</span><span>b</span></div></main>`);
    const second = body.querySelectorAll("span")[1];
    expect(selectorOf(second)).toBe("#app > div > span:nth-of-type(2)");
  });

  it("keeps data-tour and starts at body without an id", () => {
    const body = mount(`<section><button data-tour="compare-groups">Compare</button></section>`);
    expect(selectorOf(body.querySelector("button")!)).toBe('body > section > button[data-tour="compare-groups"]');
  });
});

describe("attributesOf", () => {
  it("keeps identifying attributes only", () => {
    const body = mount(`<button class="px-2" data-tour="x" aria-label="Go" style="color:red" onclick="">Go</button>`);
    expect(attributesOf(body.querySelector("button")!)).toEqual({ class: "px-2", "data-tour": "x", "aria-label": "Go" });
  });
});

describe("textOf", () => {
  it("collapses whitespace and cuts long text", () => {
    const body = mount(`<p>  one\n   two  </p><p>${"x".repeat(250)}</p>`);
    const [short, long] = body.querySelectorAll("p");
    expect(textOf(short)).toBe("one two");
    expect(textOf(long)).toHaveLength(201);
  });
});

describe("htmlOf", () => {
  it("collapses svg path data and drops comments", () => {
    const body = mount(`<button><!----><svg><path d="M0 0 L10 10"></path></svg>Go</button>`);
    expect(htmlOf(body.querySelector("button")!)).toBe(`<button><svg><path d="…"></path></svg>Go</button>`);
  });

  it("cuts long markup and says how much is left", () => {
    const body = mount(`<p>${"x".repeat(100)}</p>`);
    expect(htmlOf(body.querySelector("p")!, 20)).toBe(`<p>${"x".repeat(17)}… [87 more characters]`);
  });
});

describe("contextOf", () => {
  it("falls back to the nearest ancestor with metadata", () => {
    const body = mount(`<div><i>icon</i></div>`);
    tag(body.querySelector("div")!, "src/lib/a.svelte", 7);
    const context = contextOf(body.querySelector("i")!);
    expect(context.tag).toBe("i");
    expect(context.source).toEqual({ file: "src/lib/a.svelte", line: 7, column: 3 });
    expect(context.sourceIsAncestor).toBe(true);
  });

  it("has no source when nothing carries metadata", () => {
    const body = mount(`<div></div>`);
    expect(contextOf(body.querySelector("div")!).source).toBeNull();
  });
});

describe("crumbsOf", () => {
  it("offers the outermost element of each file's markup, innermost first", () => {
    const body = mount(`<section><div><ul><li><span>x</span></li></ul></div></section>`);
    const [section, div, ul, li, span] = ["section", "div", "ul", "li", "span"].map((t) => body.querySelector(t)!);
    tag(section, "src/routes/+page.svelte", 3);
    tag(div, "src/lib/card.svelte", 1);
    tag(ul, "src/lib/card.svelte", 2);
    tag(li, "src/lib/row.svelte", 1);
    tag(span, "src/lib/row.svelte", 2);
    expect(crumbsOf(span).map((c) => c.element)).toEqual([li, div, section]);
    expect(crumbsOf(span).map((c) => c.label)).toEqual(["li · row.svelte:1", "div · card.svelte:1", "section · +page.svelte:3"]);
  });

  it("leaves out the element itself", () => {
    const body = mount(`<div><p>x</p></div>`);
    const [div, p] = [body.querySelector("div")!, body.querySelector("p")!];
    tag(div, "src/lib/card.svelte", 1);
    tag(p, "src/lib/card.svelte", 2);
    expect(crumbsOf(div)).toEqual([]);
    expect(crumbsOf(p).map((c) => c.element)).toEqual([div]);
  });
});

describe("labelOf", () => {
  it("is the tag alone without metadata", () => {
    const body = mount(`<b></b>`);
    expect(labelOf(body.querySelector("b")!)).toBe("b");
  });
});

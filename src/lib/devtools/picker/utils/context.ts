import type { ComponentUse, Crumb, ElementContext, SourceLocation } from "$lib/devtools/picker/types";

/**
 * What Svelte 5 attaches to every element it creates in dev builds. `parent`
 * is the stack of blocks and components the element was rendered inside;
 * component entries carry the tag they were used as.
 */
interface DevStackEntry {
  type: string;
  file: string;
  line: number;
  column: number;
  parent: DevStackEntry | null;
  componentTag?: string;
}

interface SvelteMeta {
  loc: SourceLocation;
  parent: DevStackEntry | null;
}

export const HTML_LIMIT = 2000;
const TEXT_LIMIT = 200;
const ATTRIBUTE_LIMIT = 300;
const MAX_COMPONENTS = 12;
const MAX_SELECTOR_DEPTH = 8;
const MAX_CRUMBS = 8;

const KEPT_ATTRIBUTE = /^(id|class|role|href|type|name|for|placeholder|title|alt|data-.+|aria-.+)$/;

export function metaOf(element: Element): SvelteMeta | null {
  return (element as Element & { __svelte_meta?: SvelteMeta }).__svelte_meta ?? null;
}

/** The element itself or its nearest ancestor that carries Svelte dev metadata. */
export function sourcedAncestor(element: Element): Element | null {
  let current: Element | null = element;
  while (current && !metaOf(current)) current = current.parentElement;
  return current;
}

/** Components the element renders inside, innermost first. */
export function componentsOf(meta: SvelteMeta | null): ComponentUse[] {
  const out: ComponentUse[] = [];
  for (let entry = meta?.parent ?? null; entry && out.length < MAX_COMPONENTS; entry = entry.parent) {
    if (entry.type !== "component" || !entry.componentTag || entry.file.startsWith(".svelte-kit/")) continue;
    out.push({ tag: entry.componentTag, location: { file: entry.file, line: entry.line, column: entry.column } });
  }
  return out;
}

const escapeAttribute = (value: string) => value.replace(/["\\]/g, "\\$&");

/** A CSS selector path from the nearest ancestor with an id (or `body`) down to the element. */
export function selectorOf(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.tagName !== "BODY" && parts.length < MAX_SELECTOR_DEPTH) {
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      return parts.join(" > ");
    }
    let part = current.tagName.toLowerCase();
    const tour = current.getAttribute("data-tour");
    if (tour) part += `[data-tour="${escapeAttribute(tour)}"]`;
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  if (current?.tagName === "BODY") parts.unshift("body");
  return parts.join(" > ");
}

export function attributesOf(element: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { name, value } of Array.from(element.attributes)) {
    if (KEPT_ATTRIBUTE.test(name)) out[name] = truncate(value, ATTRIBUTE_LIMIT);
  }
  return out;
}

const truncate = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}…` : text);

export function textOf(element: Element): string {
  return truncate((element.textContent ?? "").replace(/\s+/g, " ").trim(), TEXT_LIMIT);
}

/**
 * The element's markup without Svelte's empty anchor comments and with SVG
 * path data collapsed, cut to `limit` characters.
 */
export function htmlOf(element: Element, limit = HTML_LIMIT): string {
  const clone = element.cloneNode(true) as Element;
  for (const path of Array.from(clone.querySelectorAll("path, polygon, polyline"))) {
    for (const name of ["d", "points"]) if (path.hasAttribute(name)) path.setAttribute(name, "…");
  }
  const html = clone.outerHTML.replace(/<!--[^]*?-->/g, "");
  if (html.length <= limit) return html;
  return `${html.slice(0, limit)}… [${html.length - limit} more characters]`;
}

export function contextOf(element: Element): ElementContext {
  const sourced = sourcedAncestor(element);
  const meta = sourced ? metaOf(sourced) : null;
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    source: meta?.loc ?? null,
    sourceIsAncestor: sourced !== null && sourced !== element,
    components: componentsOf(meta),
    selector: selectorOf(element),
    attributes: attributesOf(element),
    text: textOf(element),
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    html: htmlOf(element)
  };
}

export const fileName = (file: string) => file.split("/").pop() ?? file;

/** `button · compare-field.svelte:42` */
export function labelOf(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const loc = metaOf(element)?.loc;
  return loc ? `${tag} · ${fileName(loc.file)}:${loc.line}` : tag;
}

/**
 * Ancestors worth re-targeting to, innermost first: for each run of
 * consecutive ancestors written in the same file, its outermost element.
 * Elements without metadata, and the element itself, are skipped.
 */
export function crumbsOf(element: Element): Crumb[] {
  const out: Crumb[] = [];
  let runFile: string | null = null;
  let runTop: Element | null = null;
  for (let current: Element | null = element; current && current.tagName !== "BODY"; current = current.parentElement) {
    const file = metaOf(current)?.loc.file;
    if (!file) continue;
    if (file !== runFile) {
      if (runTop && runTop !== element) out.push({ element: runTop, label: labelOf(runTop) });
      if (out.length >= MAX_CRUMBS) return out;
      runFile = file;
    }
    runTop = current;
  }
  if (runTop && runTop !== element) out.push({ element: runTop, label: labelOf(runTop) });
  return out;
}

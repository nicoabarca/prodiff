import type { ElementContext, InboxMessage, PickerMode, SourceLocation } from "$lib/devtools/picker/types";
import { fileName } from "$lib/devtools/picker/utils/context";

/** Upper bound on a whole message, in characters. */
export const MESSAGE_LIMIT = 16_000;
const MIN_HTML_BUDGET = 300;

const FRAMING: Record<PickerMode, string> = {
  ask: [
    "This is a question from the ProDiff dev element picker: the person selected elements in the running app (SvelteKit SPA, Svelte 5, Tauri) and asks about them.",
    "Answer here in the session; nothing is shown in the app. Start the answer with the first line of this message so it is clear which elements it is about.",
    "It is read-only: do not edit files or run commands that change anything because of it. If it asks for a change, say what you would change; the person decides here."
  ].join("\n"),
  do: [
    "This is an instruction from the ProDiff dev element picker: the person selected elements in the running app (SvelteKit SPA, Svelte 5, Tauri) and wants this change made.",
    "Make it in this repository the way you would if they had typed it here; the dev server reloads the app."
  ].join("\n")
};

const LOCATIONS_NOTE =
  "Source locations come from Svelte's dev metadata: file:line:column of the element's opening tag, relative to the repository root, with 1-based lines and 0-based columns.";

export const formatLocation = (loc: SourceLocation) => `${loc.file}:${loc.line}:${loc.column}`;

const MODE_NAME: Record<PickerMode, string> = { ask: "Ask", do: "Do" };

/** `button · compare-field.svelte:42`, the element's own location or the nearest ancestor's. */
export function elementLabel(element: ElementContext): string {
  if (!element.source) return element.tag;
  return `${element.tag} · ${fileName(element.source.file)}:${element.source.line}`;
}

/** The line that opens every message and names where it came from: `[ProDiff Ask] button · a.svelte:4, div · b.svelte:9` */
export function originLine(mode: PickerMode, elements: ElementContext[]): string {
  return `[ProDiff ${MODE_NAME[mode]}] ${elements.map(elementLabel).join(", ")}`;
}

function elementBlock(index: number, element: ElementContext, html: string): string {
  const lines: string[] = [];
  const where = element.source
    ? `${element.sourceIsAncestor ? "inside markup at" : "at"} ${formatLocation(element.source)}`
    : "(no source location)";
  lines.push(`### Element ${index + 1}: <${element.tag}> ${where}`);
  if (element.components.length > 0) {
    lines.push(
      `Rendered inside: ${element.components.map((c) => `<${c.tag}> at ${formatLocation(c.location)}`).join(" › ")}`
    );
  }
  lines.push(`Selector: ${element.selector}`);
  const attributes = Object.entries(element.attributes).map(([name, value]) => `${name}="${value}"`);
  if (attributes.length > 0) lines.push(`Attributes: ${attributes.join(" ")}`);
  if (element.text) lines.push(`Text: "${element.text}"`);
  const { x, y, width, height } = element.rect;
  lines.push(`Box: x=${x} y=${y}, ${width}×${height} px`);
  lines.push("HTML:", "```html", html, "```");
  return lines.join("\n");
}

/**
 * The message for one send: framing for the mode, where the app is, the
 * person's text, then one block per element. Element HTML shrinks evenly when
 * the whole would pass `MESSAGE_LIMIT`.
 */
export function formatMessage(input: {
  mode: PickerMode;
  instruction: string;
  elements: ElementContext[];
  route: string;
  viewport: { width: number; height: number };
}): InboxMessage {
  const { mode, instruction, elements, route, viewport } = input;
  const origin = originLine(mode, elements);
  const head = [
    origin,
    "",
    FRAMING[mode],
    LOCATIONS_NOTE,
    "",
    `Route: ${route}`,
    `Viewport: ${viewport.width}×${viewport.height} px`,
    "",
    mode === "ask" ? "## Question" : "## Instruction",
    instruction.trim(),
    "",
    `## Selected elements (${elements.length})`
  ].join("\n");

  const withoutHtml = elements.map((element, i) => elementBlock(i, element, "")).join("\n\n");
  const room = MESSAGE_LIMIT - head.length - withoutHtml.length - 2;
  const budget = Math.max(MIN_HTML_BUDGET, Math.floor(room / Math.max(1, elements.length)));
  const blocks = elements.map((element, i) => {
    const html =
      element.html.length > budget
        ? `${element.html.slice(0, budget)}… [${element.html.length - budget} more characters]`
        : element.html;
    return elementBlock(i, element, html);
  });

  return {
    text: `${head}\n\n${blocks.join("\n\n")}`,
    meta: { app: "prodiff", mode, from: elements.map(elementLabel).join(", "), route }
  };
}

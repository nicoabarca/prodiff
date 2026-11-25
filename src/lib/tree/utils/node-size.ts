/**
 * The box a tree node needs for what it prints, in CSS pixels. The numbers
 * mirror the classes in `tree/components/node.svelte`: change one and the
 * other must follow, or text spills out of the box or the box gapes.
 *
 * A node starts at the minimum size. A name or a row of counts too long for it
 * widens the node up to the maximum, then the name wraps to at most three
 * lines and the node grows taller.
 */
import type { Size } from "$lib/tree/utils/layout";

export interface NodeContent {
  label: string;
  total: string | null;
  counts: string[];
  figures: string[];
}

export type Measure = (text: string, font: string) => number;

export const MIN_WIDTH = 200;
export const MAX_WIDTH = 280;
export const MIN_HEIGHT = 100;

const SANS = '"Inter Variable", sans-serif';
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const LABEL_FONT = `500 15px ${SANS}`;
const COUNT_FONT = `500 12px ${MONO}`;
const TOTAL_FONT = `12px ${MONO}`;
const FIGURE_FONT = `500 13px ${SANS}`;

const LABEL_LINE = 18.75;
const LABEL_LINES = 3;
const COUNT_LINE = 12;
const FIGURE_LINE = 19.5;
const BAR = 6;
const GAP = 4;
const COUNT_GAP = 4;
const FIGURE_GAP = 8;
const NUMS_GAP = 2;
const TOTAL_PULL = 2;
const PADDING_X = 16;
const PADDING_Y = 12;
const BORDER = 2;
// The collapse button hangs over the bottom edge and covers this much of the
// padding above it.
const BUTTON_ROOM = 8;
// Room for a font that loads after the measuring, whose glyphs run wider.
const SLACK = 4;

/** Loads every font `nodeSize` measures in, so the measure is not a fallback's. */
export async function loadNodeFonts(): Promise<void> {
  await Promise.all(
    [LABEL_FONT, COUNT_FONT, TOTAL_FONT, FIGURE_FONT].map((font) => document.fonts.load(font))
  );
}

let context: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * Text width from a canvas in the font the node draws in. Without a canvas,
 * as under jsdom, every glyph is taken as 0.6 em wide.
 */
export const measureText: Measure = (text, font) => {
  if (context === undefined) {
    context =
      typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d");
  }
  if (context === null) return text.length * Number(/(\d+)px/.exec(font)?.[1] ?? 0) * 0.6;
  context.font = font;
  return context.measureText(text).width;
};

/**
 * How many lines `text` wraps to at `width`, breaking between words, and
 * inside a word too long for a line on its own, as `overflow-wrap: anywhere`
 * does.
 */
function lineCount(text: string, width: number, measure: Measure): number {
  const space = measure(" ", LABEL_FONT);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const length = measure(word, LABEL_FONT);
    const next = used === 0 ? length : used + space + length;
    if (next <= width) {
      used = next;
      continue;
    }
    if (used > 0) lines += 1;
    lines += Math.ceil(length / width) - 1;
    used = length % width || width;
  }
  return lines;
}

const rowWidth = (items: string[], font: string, gap: number, measure: Measure) =>
  items.reduce((sum, item) => sum + measure(item, font), 0) + gap * Math.max(0, items.length - 1);

export function nodeSize(content: NodeContent, measure: Measure = measureText): Size {
  const frameX = PADDING_X + BORDER + SLACK;
  const needed = Math.max(
    measure(content.label, LABEL_FONT),
    rowWidth(content.counts, COUNT_FONT, COUNT_GAP, measure),
    rowWidth(content.figures, FIGURE_FONT, FIGURE_GAP, measure),
    content.total === null ? 0 : measure(content.total, TOTAL_FONT)
  );
  const width = Math.ceil(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, needed + frameX)));

  const shared = content.total !== null;
  const lines = Math.min(LABEL_LINES, lineCount(content.label, width - frameX, measure));
  const blocks = [
    lines * LABEL_LINE,
    ...(shared ? [COUNT_LINE - TOTAL_PULL] : []),
    COUNT_LINE + (shared ? NUMS_GAP + BAR : 0),
    ...(content.figures.length > 0 ? [FIGURE_LINE] : [])
  ];
  const height =
    blocks.reduce((sum, block) => sum + block, 0) +
    GAP * (blocks.length - 1) +
    PADDING_Y +
    BORDER +
    BUTTON_ROOM;
  return { width, height: Math.ceil(Math.max(MIN_HEIGHT, height)) };
}

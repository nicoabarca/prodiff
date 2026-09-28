import type { BinaryOperator } from "$lib/custom-attributes/invokers/types";
import { tokenize } from "$lib/custom-attributes/utils/parser";
import { columnReference } from "$lib/custom-attributes/utils/print";

/**
 * One chip of the block editor. Blocks are the formula's tokens, so they can
 * hold an unfinished formula: `[a] /` is two blocks that do not parse yet.
 */
export type Block =
  | { kind: "column"; name: string }
  | { kind: "number"; value: number }
  | { kind: "operator"; op: BinaryOperator }
  | { kind: "open" }
  | { kind: "close" };

/** Blocks and the caret, which sits before the block at its index. */
export interface BlockEdit {
  blocks: Block[];
  caret: number;
}

/** The blocks of a formula's text, or null when the text does not even tokenize. */
export function toBlocks(text: string): Block[] | null {
  try {
    return tokenize(text).map((token): Block => {
      switch (token.kind) {
        case "column":
          return { kind: "column", name: token.name };
        case "number":
          return { kind: "number", value: token.value };
        case "operator":
          return { kind: "operator", op: token.op };
        case "open":
          return { kind: "open" };
        case "close":
          return { kind: "close" };
      }
    });
  } catch {
    return null;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "column":
      return columnReference(block.name);
    case "number":
      return String(block.value);
    case "operator":
      return block.op;
    case "open":
      return "(";
    case "close":
      return ")";
  }
}

/** The formula text the blocks spell, spaced the way the printer spaces it. */
export function fromBlocks(blocks: Block[]): string {
  return blocks.map(blockText).join(" ").replaceAll("( ", "(").replaceAll(" )", ")");
}

/** Inserts blocks at the caret and moves the caret past them. */
export function insertAt(edit: BlockEdit, inserted: Block[]): BlockEdit {
  const blocks = [...edit.blocks];
  blocks.splice(edit.caret, 0, ...inserted);
  return { blocks, caret: edit.caret + inserted.length };
}

/** Inserts a pair of parentheses with the caret between them. */
export function insertParentheses(edit: BlockEdit): BlockEdit {
  const { blocks } = insertAt(edit, [{ kind: "open" }, { kind: "close" }]);
  return { blocks, caret: edit.caret + 1 };
}

/** Removes the block before the caret, as Backspace does. */
export function removeBefore(edit: BlockEdit): BlockEdit {
  if (edit.caret === 0) return edit;
  const blocks = [...edit.blocks];
  blocks.splice(edit.caret - 1, 1);
  return { blocks, caret: edit.caret - 1 };
}

/** Moves the caret, kept between the first and the last block. */
export function moveCaret(edit: BlockEdit, to: number): BlockEdit {
  return { ...edit, caret: Math.max(0, Math.min(edit.blocks.length, to)) };
}

<script lang="ts">
  import type { Block, BlockEdit } from "$lib/custom-attributes/utils/blocks";
  import { moveCaret, removeBefore } from "$lib/custom-attributes/utils/blocks";

  let {
    edit,
    onchange
  }: {
    edit: BlockEdit;
    onchange: (edit: BlockEdit) => void;
  } = $props();

  const OPERATOR_LABELS = { "+": "+", "-": "−", "*": "×", "/": "÷" };

  function label(block: Block): string {
    switch (block.kind) {
      case "column":
        return block.name;
      case "number":
        return String(block.value);
      case "operator":
        return OPERATOR_LABELS[block.op];
      case "open":
        return "(";
      case "close":
        return ")";
    }
  }

  function keydown(event: KeyboardEvent) {
    const next =
      event.key === "ArrowLeft"
        ? moveCaret(edit, edit.caret - 1)
        : event.key === "ArrowRight"
          ? moveCaret(edit, edit.caret + 1)
          : event.key === "Home"
            ? moveCaret(edit, 0)
            : event.key === "End"
              ? moveCaret(edit, edit.blocks.length)
              : event.key === "Backspace"
                ? removeBefore(edit)
                : null;
    if (!next) return;
    event.preventDefault();
    onchange(next);
  }
</script>

{#snippet caret(at: number)}
  {#if edit.caret === at}
    <span class="bg-primary h-5 w-0.5 shrink-0 animate-pulse" aria-hidden="true"></span>
  {/if}
{/snippet}

<!-- The canvas takes focus as one widget; the chips inside only move the caret. -->
<div
  role="textbox"
  tabindex="0"
  aria-label="Formula blocks. Arrow keys move the caret, Backspace removes the block before it."
  aria-multiline="false"
  class="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-10 cursor-text flex-wrap items-center gap-1 border border-dashed px-2 py-1.5 focus-visible:ring-1 focus-visible:outline-none"
  onkeydown={keydown}
  onclick={(event) => {
    if (event.target === event.currentTarget) onchange(moveCaret(edit, edit.blocks.length));
  }}
>
  {#each edit.blocks as block, index (index)}
    {@render caret(index)}
    <button
      type="button"
      tabindex="-1"
      onclick={() => onchange(moveCaret(edit, index + 1))}
      class="border-border bg-background hover:bg-muted h-6 shrink-0 border px-1.5 text-xs {block.kind ===
      'column'
        ? 'text-primary font-medium'
        : block.kind === 'number'
          ? 'font-mono'
          : 'font-bold'}"
    >
      {#if block.kind === "column"}<span class="text-muted-foreground mr-1" aria-hidden="true"
          >#</span
        >{/if}{label(block)}
    </button>
  {/each}
  {@render caret(edit.blocks.length)}
  {#if edit.blocks.length === 0}
    <span class="text-muted-foreground text-xs">Click a block below to insert it here</span>
  {/if}
</div>

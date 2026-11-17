<script lang="ts">
  /**
   * The activities from Start to the selected node, one per line and numbered.
   * A long path folds its middle behind a button; an activity already met
   * earlier on the path is marked as a repeat.
   */
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import { cn } from "$lib/utils";

  let { steps }: { steps: { id: number; label: string }[] } = $props();

  const HEAD = 2;
  const TAIL = 3;

  const rows = $derived.by(() => {
    const seen = new Set<string>();
    return steps.map((step, index) => {
      const repeat = seen.has(step.label);
      seen.add(step.label);
      return { ...step, number: index + 1, repeat, last: index === steps.length - 1 };
    });
  });

  const foldable = $derived(rows.length > HEAD + TAIL + 1);

  // A new path opens folded.
  let unfolded = $derived.by(() => {
    void steps;
    return false;
  });

  const folded = $derived(foldable && !unfolded);
  const hidden = $derived(rows.length - HEAD - TAIL);
</script>

{#snippet row(step: (typeof rows)[number])}
  <li class="grid grid-cols-[1.25rem_minmax(0,1fr)] items-baseline gap-1.5">
    <span class="text-muted-foreground text-right font-mono text-[0.5625rem] tabular-nums">
      {step.number}
    </span>
    <span
      class={cn(
        "flex min-w-0 items-baseline gap-1 text-[0.6875rem] leading-snug",
        step.last && "font-semibold"
      )}
    >
      <span class="[overflow-wrap:anywhere]">{step.label}</span>
      {#if step.repeat}
        <RotateCcw
          class="text-muted-foreground size-2.5 shrink-0 self-center"
          aria-label="Repeated activity"
        />
      {/if}
    </span>
  </li>
{/snippet}

{#snippet toggle(label: string)}
  <li>
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground border-border ml-[1.6875rem] border-l border-dashed py-0.5 pl-2 text-left text-[0.625rem]"
      onclick={() => (unfolded = !unfolded)}
    >
      {label}
    </button>
  </li>
{/snippet}

<ol class="flex flex-col gap-0.5" aria-label="Variant">
  {#if folded}
    {#each rows.slice(0, HEAD) as step (step.id)}
      {@render row(step)}
    {/each}
    {@render toggle(`${hidden} more steps`)}
    {#each rows.slice(-TAIL) as step (step.id)}
      {@render row(step)}
    {/each}
  {:else}
    {#each rows as step (step.id)}
      {@render row(step)}
    {/each}
    {#if foldable}
      {@render toggle("Show fewer")}
    {/if}
  {/if}
</ol>

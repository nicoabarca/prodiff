<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Split from "@lucide/svelte/icons/split";
  import type { TreeNodeData } from "$lib/tree/utils/flow";

  let { data }: { data: TreeNodeData } = $props();

  // Group membership is the primary channel: a path only one Group follows
  // reads in that Group's accent, a shared one in Base grey. Washed right down
  // — it tints a whole node face, which has to stay readable behind text.
  const accent = $derived(
    data.membership === "a" ? "--slice-1" : data.membership === "b" ? "--slice-2" : "--slice-base"
  );
  // A wash for the face, a firmer version of the same hue for the border, and
  // the accent itself for the label — so membership reads at a glance without
  // any of the three fighting the text.
  const fill = $derived(`color-mix(in oklab, var(${accent}) 8%, var(--card))`);
  const border = $derived(`color-mix(in oklab, var(${accent}) 45%, var(--card))`);
  const vertical = $derived(data.direction === "TB");
</script>

<Handle
  type="target"
  position={vertical ? Position.Top : Position.Left}
  style="opacity:0"
  isConnectable={false}
/>

<!-- Explicit radius: the app's theme is square (`--radius: 0`), so `rounded-lg`
     would resolve to nothing here. -->
<div
  class="relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-[0.5rem] border px-2 py-1.5 text-center transition-opacity {data.dimmed
    ? 'opacity-25'
    : ''} {data.selected ? 'ring-ring ring-2' : ''} {data.divergent
    ? 'ring-destructive/60 ring-2'
    : ''} {data.highlighted ? 'ring-foreground ring-2 ring-offset-1' : ''}"
  style="background:{fill};border-color:{data.divergent ? 'var(--destructive)' : border}"
>
  <div class="flex w-full items-start justify-center gap-1">
    <Tooltip.Root>
      <Tooltip.Trigger class="min-w-0 text-center">
        <span
          class="line-clamp-3 text-[0.6875rem] leading-tight font-medium"
          style="color:var({accent})"
        >
          {data.label}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content>{data.label}</Tooltip.Content>
    </Tooltip.Root>
    {#if data.divergent}
      <Tooltip.Root>
        <Tooltip.Trigger>
          <Split class="text-destructive size-3.5 shrink-0" aria-hidden="true" />
        </Tooltip.Trigger>
        <Tooltip.Content>Divergent attributes — they move opposite ways here</Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </div>

  <div class="flex w-full items-center justify-center gap-2 text-[0.625rem] font-medium">
    {#if data.secondaryA !== null}
      <span style="color:var(--slice-1)">A: {data.secondaryA}</span>
    {/if}
    {#if data.secondaryB !== null}
      <span style="color:var(--slice-2)">B: {data.secondaryB}</span>
    {/if}
  </div>

  {#if data.significantCount > 0 && data.peakStep}
    <!-- Outside the node box, so a count never competes with the figures for
         the little horizontal room a narrow node has. The count says how many
         differences are here; the fill says whether the biggest one is worth
         crossing the canvas for, which the count alone never could. -->
    <Tooltip.Root>
      <Tooltip.Trigger
        class="absolute -top-2 -right-2 flex size-4.5 items-center justify-center rounded-full bg-(--fill) font-mono text-[0.625rem] font-semibold text-(--ink) ring-1 ring-(--ink)/30"
        style="--fill:var(--effect-{data.peakStep});--ink:var(--effect-{data.peakStep}-foreground)"
      >
        {data.significantCount}
      </Tooltip.Trigger>
      <Tooltip.Content>
        {data.significantCount} significant difference{data.significantCount === 1 ? "" : "s"} here ·
        strongest is {data.peakBand}
      </Tooltip.Content>
    </Tooltip.Root>
  {/if}

  {#if data.hiddenBelow > 0 || data.hasChildren}
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground absolute -bottom-2 {vertical
        ? 'left-1/2 -translate-x-1/2'
        : '-right-2 bottom-1/2 translate-y-1/2'} bg-card border-border flex items-center gap-0.5 border px-1 text-[0.625rem]"
      onclick={(event) => {
        event.stopPropagation();
        data.onToggleCollapse();
      }}
    >
      {#if data.hiddenBelow > 0}
        <ChevronRight class="size-3" aria-hidden="true" />
        +{data.hiddenBelow}
      {:else}
        <ChevronDown class="size-3" aria-hidden="true" />
      {/if}
    </button>
  {/if}
</div>

<Handle
  type="source"
  position={vertical ? Position.Bottom : Position.Right}
  style="opacity:0"
  isConnectable={false}
/>

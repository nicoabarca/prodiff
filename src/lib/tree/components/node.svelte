<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Split from "@lucide/svelte/icons/split";
  import type { TreeNodeData } from "$lib/tree/utils/flow";

  let { data }: { data: TreeNodeData } = $props();

  // A path only one Group follows reads in that Group's accent, a shared one in
  // the Original's grey.
  const accent = $derived(
    data.groups.find((group) => group.id === data.membership)?.color ?? "group-original"
  );
  const accentVar = $derived(`--${accent}`);
  const fill = $derived(`color-mix(in oklab, var(${accentVar}) 8%, var(--card))`);
  const border = $derived(`color-mix(in oklab, var(${accentVar}) 45%, var(--card))`);
</script>

<Handle type="target" position={Position.Top} style="opacity:0" isConnectable={false} />

<!-- Explicit radius: the theme is square (`--radius: 0`), so `rounded-lg`
     resolves to nothing here. -->
<div
  class="relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-[0.5rem] border px-2 py-1.5 text-center transition-opacity {data.dimmed
    ? 'opacity-25'
    : ''} {data.selected ? 'ring-ring ring-2' : ''} {data.divergent
    ? 'ring-destructive/60 ring-2'
    : ''} {data.highlighted
    ? 'shadow-[0_0_1.25rem_0.125rem_rgba(99,102,241,0.55)] ring-2 ring-indigo-500 ring-offset-1'
    : ''} {data.entering ? 'tree-node-enter' : ''} {data.ghost
    ? 'tree-node-exit pointer-events-none'
    : ''}"
  style="background:{fill};border-color:{data.divergent ? 'var(--destructive)' : border}"
>
  <div class="flex w-full items-start justify-center gap-1">
    <Tooltip.Root>
      <Tooltip.Trigger class="min-w-0 text-center">
        <span
          class="line-clamp-3 text-[0.6875rem] leading-tight font-medium"
          style="color:var({accentVar})"
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
        <Tooltip.Content>Divergent attributes: they move opposite ways here</Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </div>

  <div class="flex w-full items-center justify-center gap-2 text-[0.625rem] font-medium">
    {#each data.groups as group, index (group.id)}
      {#if data.secondaries[index] !== null && data.secondaries[index] !== undefined}
        <span style="color:var(--{group.color})">{data.secondaries[index]}</span>
      {/if}
    {/each}
  </div>

  {#if data.significantCount > 0 && data.peakStep}
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
      class="text-muted-foreground hover:text-foreground bg-card border-border absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-0.5 border px-1 text-[0.625rem]"
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

<Handle type="source" position={Position.Bottom} style="opacity:0" isConnectable={false} />

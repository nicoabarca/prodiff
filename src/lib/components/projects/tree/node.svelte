<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Split from "@lucide/svelte/icons/split";
  import type { TreeNodeData } from "$lib/components/projects/tree/flow";

  let { data }: { data: TreeNodeData } = $props();

  // Group membership is the primary channel: a path only one Group follows
  // reads in that Group's accent, a shared one in Base grey.
  const accent = $derived(
    data.membership === "a" ? "--slice-1" : data.membership === "b" ? "--slice-2" : "--slice-base"
  );
  const vertical = $derived(data.direction === "TB");
</script>

<Handle
  type="target"
  position={vertical ? Position.Top : Position.Left}
  style="opacity:0"
  isConnectable={false}
/>

<div
  class="bg-card relative flex h-full w-full flex-col justify-center gap-1 border-l-4 px-2.5 py-1.5 text-left transition-opacity {data.dimmed
    ? 'opacity-25'
    : ''} {data.selected ? 'ring-ring ring-2' : ''} {data.divergent
    ? 'border-destructive ring-destructive/60 ring-2'
    : 'border-border'}"
  style="border-left-color:var({accent})"
>
  <div class="flex items-start gap-1">
    <Tooltip.Root>
      <Tooltip.Trigger class="min-w-0 flex-1 text-left">
        <span class="line-clamp-2 text-xs leading-tight font-medium">{data.label}</span>
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

  <div class="text-muted-foreground flex items-center gap-2 font-mono text-[0.625rem]">
    <span>{data.secondary}</span>
    {#if data.significantCount > 0}
      <span class="text-foreground ml-auto font-semibold">{data.significantCount} sig</span>
    {/if}
  </div>

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

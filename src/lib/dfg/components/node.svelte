<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { DfgNodeData } from "$lib/dfg/types";

  let { data }: { data: DfgNodeData } = $props();

  const vertical = $derived(data.direction === "TB");
  const boundary = $derived(data.kind !== "activity");
  // Significance shades the box rather than resizing it: the box is a fixed
  // size so the layout can be cached across every change of face.
  const tint = $derived(6 + Math.round(data.significance * 14));
  const fill = $derived(`color-mix(in oklab, var(--foreground) ${tint}%, var(--card))`);
</script>

<Handle
  type="target"
  position={vertical ? Position.Top : Position.Left}
  style="opacity:0"
  isConnectable={false}
/>

{#if boundary}
  <div
    class="flex h-full w-full items-center justify-center rounded-full border text-[0.6875rem] font-semibold tracking-wide uppercase {data.kind ===
    'start'
      ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
      : 'border-rose-500/50 text-rose-600 dark:text-rose-400'}"
  >
    {data.label}
  </div>
{:else}
  <!-- Explicit radius: the theme is square (`--radius: 0`), so `rounded-lg`
       resolves to nothing here. -->
  <div
    class="border-border relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-[0.5rem] border px-2 py-1.5 text-center {data.selected
      ? 'ring-ring ring-2'
      : ''}"
    style="background:{fill}"
  >
    <Tooltip.Root>
      <Tooltip.Trigger class="min-w-0 text-center">
        <span class="line-clamp-2 text-[0.6875rem] leading-tight font-medium">{data.label}</span>
      </Tooltip.Trigger>
      <Tooltip.Content>{data.label}</Tooltip.Content>
    </Tooltip.Root>

    <div class="flex w-full items-center justify-center gap-2 text-[0.625rem] font-medium">
      {#each data.groups as group, index (group.id)}
        {#if data.counts[index]}
          <span style="color:var(--{group.color})">{data.counts[index]}</span>
        {/if}
      {/each}
    </div>

    {#if data.findings > 0}
      <Tooltip.Root>
        <Tooltip.Trigger
          class="bg-effect-3 text-effect-3-foreground ring-foreground/20 absolute -top-2 -right-2 flex size-4.5 items-center justify-center rounded-full font-mono text-[0.625rem] font-semibold ring-1"
        >
          {data.findings}
        </Tooltip.Trigger>
        <Tooltip.Content>
          {data.findings} significant difference{data.findings === 1 ? "" : "s"} here
        </Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </div>
{/if}

<Handle
  type="source"
  position={vertical ? Position.Bottom : Position.Right}
  style="opacity:0"
  isConnectable={false}
/>

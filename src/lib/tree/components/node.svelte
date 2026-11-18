<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Split from "@lucide/svelte/icons/split";
  import SignificanceBadge from "$lib/tree/components/significance-badge.svelte";
  import type { TreeNodeData } from "$lib/tree/utils/flow";
  import { shade } from "$lib/groups/utils/shade";
  import { formatNumber, formatPercent } from "$lib/format";

  let { id, data }: { id: string; data: TreeNodeData } = $props();

  // A path only one Group follows reads in that Group's accent, a shared one in
  // the Original's grey.
  const accent = $derived(
    data.groups.find((group) => group.id === data.membership)?.color ?? "group-original"
  );
  const tint = $derived(shade(accent, null));
  const reaching = $derived(data.groups.filter((group) => (data.cases[group.id] ?? 0) > 0));
  const shared = $derived(reaching.length > 1);
  const total = $derived(reaching.reduce((sum, group) => sum + data.cases[group.id], 0));
</script>

<Handle type="target" position={Position.Top} style="opacity:0" isConnectable={false} />

{#if data.root}
  <div
    class="relative flex h-full w-full items-center justify-center transition-opacity {data.dimmed
      ? 'opacity-25'
      : ''}"
    style="transition-duration:var(--tree-dim-duration)"
  >
    <Tooltip.Root>
      <Tooltip.Trigger
        class="flex size-14 items-center justify-center rounded-full bg-emerald-500 {data.selected
          ? 'ring-ring ring-2'
          : ''}"
      >
        <svg width="22" height="22" viewBox="0 0 14 14" aria-hidden="true">
          <polygon points="3,2 3,12 12,7" fill="white" />
        </svg>
      </Tooltip.Trigger>
      <Tooltip.Content>{data.label}</Tooltip.Content>
    </Tooltip.Root>
  </div>
{:else}
  <!-- Explicit radius: the theme is square (`--radius: 0`), so `rounded-lg`
       resolves to nothing here. -->
  <div
    data-tour="tree-node"
    data-tour-key={id}
    class="relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-[0.5rem] border px-2 py-1.5 text-center transition-opacity {data.dimmed
      ? 'opacity-25'
      : ''} {data.selected ? 'ring-ring ring-2' : ''} {data.divergent
      ? 'ring-destructive/60 ring-2'
      : ''} {data.highlighted
      ? 'shadow-[0_0_1rem_0.25rem_rgba(99,102,241,0.55)]'
      : ''} {data.entering ? 'tree-node-enter' : ''} {data.ghost
      ? 'tree-node-exit pointer-events-none'
      : ''}"
    style="background:{tint.fill};border-color:{data.highlighted
      ? 'var(--color-indigo-500)'
      : data.divergent
        ? 'var(--destructive)'
        : tint.border};border-width:{data.highlighted
      ? '0.125rem'
      : ''};transition-duration:var(--tree-dim-duration)"
  >
    <div class="flex w-full items-start justify-center gap-1">
      <Tooltip.Root>
        <Tooltip.Trigger class="min-w-0 text-center">
          <span
            class="line-clamp-3 text-[0.6875rem] leading-tight font-medium"
            style="color:var(--{accent})"
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

    {#if shared}
      <span
        class="-mt-0.5 font-mono text-[0.5625rem] leading-none tabular-nums opacity-75"
        style="color:var(--{accent})"
      >
        {formatNumber(total)}
      </span>
    {/if}

    <div class="flex w-full flex-col gap-0.5">
      <div
        class="flex gap-1 font-mono text-[0.5625rem] leading-none font-medium tabular-nums {shared
          ? 'justify-between'
          : 'justify-center'}"
      >
        {#each reaching as group (group.id)}
          <span style="color:var(--{group.color})">
            {formatNumber(data.cases[group.id])}
            {#if shared}({formatPercent(data.split[group.id])}){/if}
          </span>
        {/each}
      </div>
      {#if shared}
        <div class="bg-muted flex h-1.5 w-full overflow-hidden" aria-hidden="true">
          {#each reaching as group (group.id)}
            <span style="width:{data.split[group.id] * 100}%;background:var(--{group.color})"
            ></span>
          {/each}
        </div>
      {/if}
    </div>

    {#if data.figures.some((figure) => figure !== null)}
      <div class="flex w-full items-center justify-center gap-2 text-[0.625rem] font-medium">
        {#each data.groups as group, index (group.id)}
          {#if data.figures[index] !== null && data.figures[index] !== undefined}
            <span style="color:var(--{group.color})">{data.figures[index]}</span>
          {/if}
        {/each}
      </div>
    {/if}

    {#if data.significantCount > 0 && data.peakStep && data.peakBand}
      <SignificanceBadge count={data.significantCount} step={data.peakStep} band={data.peakBand} />
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
{/if}

<Handle type="source" position={Position.Bottom} style="opacity:0" isConnectable={false} />

<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { DfgNodeData } from "$lib/dfg/types";

  let { data }: { data: DfgNodeData } = $props();

  const vertical = $derived(data.direction === "TB");
  const boundary = $derived(data.kind !== "activity");
  // An activity only one Group reaches reads in that Group's accent, a shared
  // one in the Original's grey. The same rule the tree draws by.
  const accent = $derived(
    data.groups.find((group) => group.id === data.membership)?.color ?? "group-original"
  );
  const accentVar = $derived(`--${accent}`);
  const fill = $derived(`color-mix(in oklab, var(${accentVar}) 8%, var(--card))`);
  const border = $derived(`color-mix(in oklab, var(${accentVar}) 45%, var(--card))`);
</script>

<Handle
  type="target"
  position={vertical ? Position.Top : Position.Left}
  style="opacity:0"
  isConnectable={false}
/>

{#if boundary}
  <Tooltip.Root>
    <Tooltip.Trigger
      class="flex h-full w-full items-center justify-center rounded-full {data.kind === 'start'
        ? 'bg-emerald-500'
        : 'bg-rose-500'}"
    >
      {#if data.kind === "start"}
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <polygon points="3,2 3,12 12,7" fill="white" />
        </svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="0" y="0" width="12" height="12" rx="1" fill="white" />
        </svg>
      {/if}
    </Tooltip.Trigger>
    <Tooltip.Content>
      {data.label}
      {#if Object.values(data.counts).some((count) => count !== null)}
        · {Object.values(data.counts)
          .filter((count) => count !== null)
          .join(" · ")}
      {/if}
    </Tooltip.Content>
  </Tooltip.Root>
{:else}
  <!-- Explicit radius: the theme is square (`--radius: 0`), so `rounded-lg`
       resolves to nothing here. -->
  <div
    class="relative flex h-full w-full flex-col items-center justify-center gap-1 rounded-[0.5rem] border px-2 py-1.5 text-center {data.selected
      ? 'ring-ring ring-2'
      : ''}"
    style="background:{fill};border-color:{border}"
  >
    <Tooltip.Root>
      <Tooltip.Trigger class="min-w-0 text-center">
        <span
          class="line-clamp-2 text-[0.6875rem] leading-tight font-medium"
          style="color:var({accentVar})"
        >
          {data.label}
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content>{data.label}</Tooltip.Content>
    </Tooltip.Root>

    <div class="flex w-full items-center justify-center gap-2 text-[0.625rem] font-medium">
      {#each data.groups as group (group.id)}
        {#if data.counts[group.id]}
          <span style="color:var(--{group.color})">{data.counts[group.id]}</span>
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

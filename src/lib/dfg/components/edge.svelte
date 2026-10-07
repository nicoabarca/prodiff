<script lang="ts">
  import { BaseEdge, EdgeLabel, type EdgeProps } from "@xyflow/svelte";
  import type { DfgEdgeData } from "$lib/dfg/types";
  import { pickEdge } from "$lib/dfg/state/view.svelte";

  let { data, id }: EdgeProps = $props();

  const edge = $derived(data as DfgEdgeData);
</script>

<BaseEdge
  path={edge.shaft}
  style="stroke-width:{edge.width.toFixed(2)};stroke:{edge.highlighted
    ? 'var(--color-indigo-500)'
    : 'var(--muted-foreground)'}"
  class={edge.boundary && !edge.highlighted ? "opacity-60 [stroke-dasharray:4_4]" : undefined}
/>

<!-- The head is its own filled shape: the shaft stops where its base is, so no
     stroke shows through the tip at any weight. -->
<path
  d={edge.head}
  fill={edge.highlighted ? "var(--color-indigo-500)" : "var(--muted-foreground)"}
  stroke="none"
  class={edge.boundary && !edge.highlighted ? "opacity-60" : undefined}
/>

{#snippet dot(color: string)}
  <span class="size-1.5 shrink-0 rounded-full" style="background:var(--{color})"></span>
{/snippet}

{#if edge.label}
  <EdgeLabel x={edge.labelAt.x} y={edge.labelAt.y} transparent>
    <button
      type="button"
      title="Light this path"
      class="bg-card inline-flex cursor-pointer items-center gap-1 rounded-full border px-1.5 py-px text-[0.625rem] leading-tight font-medium whitespace-nowrap {edge.highlighted
        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
        : 'border-border/70 text-muted-foreground hover:border-ring'}"
      onclick={() => pickEdge(id)}
    >
      {#if edge.label.shared}
        {#each edge.label.parts as part (part.id)}
          {@render dot(part.color)}
        {/each}
        {edge.label.parts[0].text}
      {:else}
        {#each edge.label.parts as part, index (part.id)}
          {#if index > 0}
            <span class="text-border">·</span>
          {/if}
          {@render dot(part.color)}
          {part.text}
        {/each}
      {/if}
    </button>
  </EdgeLabel>
{/if}

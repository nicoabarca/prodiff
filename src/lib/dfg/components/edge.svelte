<script lang="ts">
  import { BaseEdge, EdgeLabel, type EdgeProps } from "@xyflow/svelte";
  import type { DfgEdgeData } from "$lib/dfg/types";

  let { data }: EdgeProps = $props();

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

{#if edge.label}
  <EdgeLabel x={edge.labelAt.x} y={edge.labelAt.y} transparent>
    <span
      class="border-border/70 bg-card text-muted-foreground inline-block rounded-full border px-1.5 py-px text-[0.625rem] leading-tight font-medium whitespace-nowrap"
    >
      {edge.label}
    </span>
  </EdgeLabel>
{/if}

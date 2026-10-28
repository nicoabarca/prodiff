<script lang="ts">
  import { BaseEdge, EdgeLabel, type EdgeProps } from "@xyflow/svelte";
  import type { DfgEdgeData } from "$lib/dfg/types";
  import { colorVar } from "$lib/format";

  let { data }: EdgeProps = $props();

  const edge = $derived(data as DfgEdgeData);
</script>

<g
  class="transition-opacity duration-200 {edge.dimmed ? 'opacity-15' : ''}"
  style={edge.highlighted
    ? "filter:drop-shadow(0 0 0.25rem rgb(99 102 241 / 0.9)) drop-shadow(0 0 0.75rem rgb(99 102 241 / 0.5))"
    : undefined}
>
  <BaseEdge
    path={edge.shaft}
    style="stroke-width:{(edge.highlighted ? Math.max(edge.width, 2) : edge.width).toFixed(
      2
    )};stroke:{edge.highlighted ? 'var(--color-indigo-500)' : 'var(--muted-foreground)'}"
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
</g>

{#if edge.waits.length > 0}
  <EdgeLabel x={edge.labelAt.x} y={edge.labelAt.y} transparent>
    <span
      class="transition-opacity duration-200 {edge.dimmed
        ? 'opacity-15'
        : ''} bg-background text-muted-foreground flex flex-col items-start gap-px px-1 py-0.5 font-mono text-[0.625rem] leading-tight whitespace-nowrap"
    >
      {#each edge.waits as wait (wait.id)}
        <span class="inline-flex items-center gap-1">
          {#if edge.dotted}
            <span class="size-1.5 rounded-full" style="background:{colorVar(wait.color)}"></span>
          {/if}
          {wait.value}
        </span>
      {/each}
    </span>
  </EdgeLabel>
{/if}

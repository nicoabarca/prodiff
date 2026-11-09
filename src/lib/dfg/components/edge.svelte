<script lang="ts">
  import { BaseEdge, EdgeLabel, type EdgeProps } from "@xyflow/svelte";
  import type { DfgEdgeData } from "$lib/dfg/types";
  import { colorVar } from "$lib/format";

  let { data }: EdgeProps = $props();

  const edge = $derived(data as DfgEdgeData);
  const color = $derived(
    edge.highlighted ? "var(--color-indigo-500)" : (edge.stroke ?? "var(--muted-foreground)")
  );
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
    )};stroke:{color}"
    class={edge.boundary && !edge.highlighted ? "opacity-60 [stroke-dasharray:4_4]" : undefined}
  />

  <!-- The head is its own filled shape: the shaft stops where its base is, so no
       stroke shows through the tip at any weight. -->
  <path
    d={edge.head}
    fill={color}
    stroke="none"
    class={edge.boundary && !edge.highlighted ? "opacity-60" : undefined}
  />
</g>

{#if edge.added}
  {#key edge.added}
    <g
      class="dfg-added pointer-events-none"
      style="filter:drop-shadow(0 0 0.25rem rgb(99 102 241 / 0.9)) drop-shadow(0 0 0.75rem rgb(99 102 241 / 0.5))"
    >
      <path
        d={edge.shaft}
        fill="none"
        stroke="var(--color-indigo-500)"
        stroke-width={Math.max(edge.width, 2).toFixed(2)}
      />
      <path d={edge.head} fill="var(--color-indigo-500)" stroke="none" />
    </g>
  {/key}
{/if}

{#if edge.label.length > 0}
  <EdgeLabel x={edge.labelAt.x} y={edge.labelAt.y} transparent>
    <span
      class="transition-opacity duration-200 {edge.dimmed
        ? 'opacity-15'
        : ''} bg-background text-muted-foreground flex flex-col items-start gap-px px-1 py-0.5 font-mono text-[0.625rem] leading-tight whitespace-nowrap"
    >
      {#each edge.label as line (line.id)}
        <span class="inline-flex items-center gap-1">
          {#if edge.dotted}
            <span class="size-1.5 rounded-full" style="background:{colorVar(line.color)}"></span>
          {/if}
          {line.value}
        </span>
      {/each}
    </span>
  </EdgeLabel>
{/if}

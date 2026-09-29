<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from "@xyflow/svelte";
  import type { TreeEdgeData } from "$lib/tree/utils/flow";

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    labelStyle,
    data
  }: EdgeProps = $props();

  const [path, labelX, labelY] = $derived(
    getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  );
  const waits = $derived((data as TreeEdgeData | undefined)?.waits ?? []);
</script>

<BaseEdge {id} {path} {style} />

{#if waits.length > 0}
  <EdgeLabel x={labelX} y={labelY} style={labelStyle}>
    <span class="flex flex-col items-start gap-px leading-tight">
      {#each waits as wait (wait.id)}
        <span class="inline-flex items-center gap-1">
          {#if waits.length > 1}
            <span class="size-1.5 rounded-full" style="background:var(--{wait.color})"></span>
          {/if}
          {wait.value}
        </span>
      {/each}
    </span>
  </EdgeLabel>
{/if}

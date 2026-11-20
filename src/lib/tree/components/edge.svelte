<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { EdgeFinding, TreeEdgeData } from "$lib/tree/utils/flow";

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
  const edge = $derived(data as TreeEdgeData | undefined);
  const waits = $derived(edge?.waits ?? []);
  const finding = $derived(edge?.finding ?? null);
  const clickable = $derived(edge?.clickable ?? false);

  function select() {
    if (clickable) edge?.onSelect();
  }
</script>

{#snippet mark(finding: EdgeFinding, className: string)}
  <Tooltip.Root>
    <Tooltip.Trigger
      class="block size-3 rounded-full bg-(--fill) ring-1 ring-(--ink)/30 {className}"
      style="--fill:var(--effect-{finding.step});--ink:var(--effect-{finding.step}-foreground)"
      aria-label="Waiting time differs on this edge"
    ></Tooltip.Trigger>
    <Tooltip.Content>Waiting time differs on this edge · {finding.band}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}

<g class={clickable ? "cursor-pointer" : undefined}>
  <BaseEdge {id} {path} {style} interactionWidth={clickable ? 20 : 0} />
</g>

{#if waits.length > 0}
  <EdgeLabel
    x={labelX}
    y={labelY}
    style={labelStyle}
    class={clickable ? "cursor-pointer" : undefined}
    onclick={select}
  >
    <span class="relative flex flex-col items-start gap-px leading-tight">
      {#each waits as wait (wait.id)}
        <span class="inline-flex items-center gap-1">
          {#if waits.length > 1}
            <span class="size-1.5 rounded-full" style="background:var(--{wait.color})"></span>
          {/if}
          {wait.value}
        </span>
      {/each}
      {#if finding}
        {@render mark(finding, "absolute -top-2.5 -right-3.5")}
      {/if}
    </span>
  </EdgeLabel>
{:else if finding}
  <EdgeLabel
    x={labelX}
    y={labelY}
    style="{labelStyle};background:transparent;padding:0"
    class={clickable ? "cursor-pointer" : undefined}
    onclick={select}
  >
    {@render mark(finding, "")}
  </EdgeLabel>
{/if}

<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
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
    <Tooltip.Trigger class="block {className}" aria-label="Waiting time differs on this edge">
      <EffectMeter step={finding.step} vertical />
    </Tooltip.Trigger>
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
    style={finding
      ? `${labelStyle};border:0.09375rem solid var(--effect);border-radius:0.1875rem;padding-right:0.75rem`
      : labelStyle}
    class={clickable ? "cursor-pointer" : undefined}
    onclick={select}
  >
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
    {#if finding}
      {@render mark(finding, "absolute -top-1 right-0 translate-x-1/2")}
    {/if}
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

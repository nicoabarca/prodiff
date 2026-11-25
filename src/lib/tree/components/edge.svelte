<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from "@xyflow/svelte";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import { effectColor } from "$lib/tree/utils/effect";
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
  const edge = $derived(data as TreeEdgeData | undefined);
  const waits = $derived(edge?.waits ?? []);
  const finding = $derived(edge?.finding ?? null);
  const clickable = $derived(edge?.clickable ?? false);
  const color = $derived(finding ? effectColor(finding.step).fill : null);
  const owner = $derived(edge?.owner ?? null);

  /**
   * The edge from where only its Group still runs on the fork at `labelY` down
   * to the child, with the same rounded corner.
   */
  const branch = $derived.by(() => {
    const dx = targetX - sourceX;
    if (Math.abs(dx) < 1) return `M ${sourceX} ${labelY} L ${targetX} ${targetY}`;
    const turn = Math.sign(dx);
    const radius = Math.min(5, Math.abs(dx) / 2, (targetY - labelY) / 2);
    const from = owner?.from ?? 0;
    return [
      `M ${from === 0 ? sourceX + turn * radius : sourceX + from} ${labelY}`,
      `L ${targetX - turn * radius} ${labelY}`,
      `Q ${targetX} ${labelY} ${targetX} ${labelY + radius}`,
      `L ${targetX} ${targetY}`
    ].join(" ");
  });

  function select() {
    if (clickable) edge?.onSelect();
  }
</script>

{#snippet values()}
  <span class="flex flex-col items-start gap-px leading-tight">
    {#each waits as wait (wait.id)}
      <span class="inline-flex items-center gap-1">
        <span class="size-1.5 rounded-full" style="background:var(--{wait.color})"></span>
        {wait.value}
      </span>
    {/each}
  </span>
{/snippet}

<g class={clickable ? "cursor-pointer" : undefined}>
  <BaseEdge {id} {path} {style} interactionWidth={clickable ? 20 : 0} />
  {#if owner}
    <path
      d={owner.trunk ? path : branch}
      fill="none"
      class="pointer-events-none"
      style="{style};stroke:var(--{owner.color})"
    />
  {/if}
</g>

{#if waits.length > 0}
  <EdgeLabel
    x={labelX}
    y={labelY}
    style={finding
      ? `${labelStyle};border:0.09375rem solid ${color};border-radius:0.1875rem;padding-right:0.875rem`
      : labelStyle}
    class={clickable ? "cursor-pointer" : undefined}
    onclick={select}
  >
    {#if finding}
      <Tooltip.Root>
        <Tooltip.Trigger class="block text-left">{@render values()}</Tooltip.Trigger>
        <Tooltip.Content>Waiting time differs on this edge · {finding.band}</Tooltip.Content>
      </Tooltip.Root>
      <EffectMeter
        step={finding.step}
        vertical
        class="pointer-events-none absolute -top-1 right-0 translate-x-1/2"
      />
    {:else}
      {@render values()}
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
    <Tooltip.Root>
      <Tooltip.Trigger class="block" aria-label="Waiting time differs on this edge">
        <EffectMeter step={finding.step} vertical />
      </Tooltip.Trigger>
      <Tooltip.Content>Waiting time differs on this edge · {finding.band}</Tooltip.Content>
    </Tooltip.Root>
  </EdgeLabel>
{/if}

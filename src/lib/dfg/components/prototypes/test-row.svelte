<script lang="ts">
  /**
   * One Significance Test, collapsed to its verdict and magnitude and opening on
   * both Groups' figures. With `showPlace` it also names the activity or edge it
   * was measured at, for lists that span the whole graph.
   */
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { effectBand } from "$lib/tree/utils/effect";
  import { higherGroup, testLine, untestable, verdict } from "$lib/tree/utils/verdict";
  import { isDurationAttribute, TRANSITION_TIME } from "$lib/analysis/attributes";
  import { colorVar } from "$lib/format";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { Finding } from "$lib/dfg/utils/prototypes/findings";
  import { cn } from "$lib/utils";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Crosshair from "@lucide/svelte/icons/crosshair";
  import Square from "@lucide/svelte/icons/square";

  let {
    finding,
    showPlace = false,
    focused = false,
    open = $bindable(false),
    onLocate
  }: {
    finding: Finding;
    showPlace?: boolean;
    focused?: boolean;
    open?: boolean;
    onLocate?: () => void;
  } = $props();

  const groups = $derived(comparedGroups());
  const block = $derived(finding.block);
  const duration = $derived(isDurationAttribute(finding.attribute));
  const higher = $derived(higherGroup(block.test, groups));
</script>

<Collapsible.Root
  bind:open
  class={cn(
    "border-border border-b",
    open && "bg-background",
    focused && "shadow-[inset_0.1875rem_0_0_var(--primary)]"
  )}
>
  <Collapsible.Trigger
    class="hover:bg-muted grid w-full cursor-pointer grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 pr-4 pl-3 text-left"
    onclick={() => {
      if (!open) onLocate?.();
    }}
  >
    <ChevronRight
      class={cn("text-muted-foreground size-3.5 transition-transform", open && "rotate-90")}
      aria-hidden="true"
    />
    <span class="flex min-w-0 flex-col gap-0.5">
      {#if showPlace}
        <span
          class="text-muted-foreground flex items-center gap-1 text-[0.625rem] whitespace-nowrap"
        >
          {#if finding.place.kind === "edge"}
            <ArrowRight class="size-3 shrink-0" aria-hidden="true" />
          {:else}
            <Square class="size-2.5 shrink-0" aria-hidden="true" />
          {/if}
          <span class="truncate" title={finding.place.label}>{finding.place.label}</span>
        </span>
      {/if}
      <span class="truncate text-xs font-semibold" title={attributeLabel(finding.attribute)}>
        <AttributeName name={finding.attribute} />
      </span>
      <span
        class="text-muted-foreground flex items-center gap-1.25 text-[0.625rem] whitespace-nowrap"
      >
        {#if higher}
          <span
            class="size-1.5 shrink-0 rounded-full"
            style="background:{colorVar(higher.color)}"
            aria-hidden="true"
          ></span>
        {/if}
        <span class="truncate">{verdict(block, groups, duration)}</span>
      </span>
    </span>
    {#if block.test}
      <span class="flex items-center gap-2">
        <EffectMeter test={block.test} />
        <EffectChip test={block.test} tooltip={false} />
      </span>
    {:else}
      <span></span>
    {/if}
  </Collapsible.Trigger>
  <Collapsible.Content class="flex flex-col gap-2 pr-4 pb-3.5 pl-8.5">
    {#if finding.attribute === TRANSITION_TIME && finding.place.kind === "edge"}
      <p class="text-muted-foreground text-[0.625rem]">
        Time waited on the edge {finding.place.label}.
      </p>
    {/if}
    <SummaryCompare summaries={block.summaries} {duration} />
    {#if !block.test}
      <p class="text-muted-foreground text-[0.625rem]">{untestable(block, groups)}</p>
    {:else}
      {#if block.test.significant && effectBand(block.test.effectSize) === "negligible"}
        <p class="text-muted-foreground text-[0.625rem]">
          The test is confident this gap is real, but it is too small to act on.
        </p>
      {/if}
      <p class="text-muted-foreground font-mono text-[0.625rem] text-pretty">
        {testLine(block.test, groups)}
      </p>
    {/if}
    {#if onLocate}
      <Button variant="outline" size="xs" class="self-start" onclick={onLocate}>
        <Crosshair data-icon="inline-start" />
        Show on graph
      </Button>
    {/if}
  </Collapsible.Content>
</Collapsible.Root>

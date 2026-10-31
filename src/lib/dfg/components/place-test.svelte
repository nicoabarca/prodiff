<script lang="ts">
  /**
   * One activity's or edge's Significance Test on one attribute, collapsed to
   * the place, its verdict and its magnitude, and opening on both Groups'
   * figures. Opening it frames the place on the canvas.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { effectBand } from "$lib/tree/utils/effect";
  import { higherGroup, testLine, untestable, verdict } from "$lib/tree/utils/verdict";
  import { isDurationAttribute } from "$lib/analysis/attributes";
  import { isPointed, point } from "$lib/dfg/state/view.svelte";
  import type { Finding } from "$lib/dfg/utils/findings";
  import { colorVar } from "$lib/format";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import { cn } from "$lib/utils";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Crosshair from "@lucide/svelte/icons/crosshair";
  import Square from "@lucide/svelte/icons/square";

  let { finding }: { finding: Finding } = $props();

  let open = $state(false);

  const groups = $derived(comparedGroups());
  const block = $derived(finding.block);
  const duration = $derived(isDurationAttribute(finding.attribute));
  const higher = $derived(higherGroup(block.test, groups));
  const differs = $derived(block.test?.significant ?? false);
</script>

<Collapsible.Root
  bind:open
  onOpenChange={(value) => {
    if (value) point(finding.place);
  }}
  class={cn(
    "border-border border-t",
    open && "bg-sidebar",
    isPointed(finding.place) && "shadow-[inset_0.1875rem_0_0_var(--primary)]"
  )}
>
  <Collapsible.Trigger
    class="hover:bg-muted grid w-full cursor-pointer grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2 py-2 pr-4 pl-6 text-left"
  >
    <ChevronRight
      class={cn("text-muted-foreground size-3.5 transition-transform", open && "rotate-90")}
      aria-hidden="true"
    />
    <span class="flex min-w-0 flex-col gap-0.5">
      <span
        class={cn(
          "flex items-center gap-1.25 text-xs font-semibold whitespace-nowrap",
          !differs && "text-muted-foreground"
        )}
      >
        {#if finding.place.kind === "edge"}
          <ArrowRight class="size-3 shrink-0" aria-hidden="true" />
        {:else}
          <Square class="size-2.5 shrink-0" aria-hidden="true" />
        {/if}
        <span class="truncate" title={finding.place.label}>{finding.place.label}</span>
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
  <Collapsible.Content class="flex flex-col gap-2 pr-4 pb-3.5 pl-11.5">
    {#if finding.place.kind === "edge"}
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
    <Button variant="outline" size="xs" class="self-start" onclick={() => point(finding.place)}>
      <Crosshair data-icon="inline-start" />
      Show on graph
    </Button>
  </Collapsible.Content>
</Collapsible.Root>

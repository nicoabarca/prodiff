<script lang="ts">
  /**
   * Prototype C: a summary of where the graph differs, attribute by attribute,
   * with its strongest findings one click from the canvas, over the selected
   * activity's tests and the Waiting Time on every edge into and out of it.
   */
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import TestRow from "$lib/dfg/components/prototypes/test-row.svelte";
  import { focusOn, isFocused } from "$lib/dfg/state/prototypes/focus.svelte";
  import { selected } from "$lib/dfg/state/view.svelte";
  import { atNode, rank, spread, type Finding } from "$lib/dfg/utils/prototypes/findings";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import { formatNumber } from "$lib/format";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";

  let {
    simplified,
    findings,
    onClose
  }: { simplified: Simplified; findings: Finding[]; onClose: () => void } = $props();

  const TOP = 3;

  const significant = $derived(findings.filter((finding) => finding.block.test?.significant));
  const nodesDiffering = $derived(
    new Set(significant.filter((f) => f.place.kind === "node").map((f) => f.place.label)).size
  );
  const edgesDiffering = $derived(
    new Set(significant.filter((f) => f.place.kind === "edge").map((f) => f.place.label)).size
  );
  const top = $derived(rank(significant, "effect").slice(0, TOP));
  const spreads = $derived(spread(findings).filter((row) => row.tested > 0));

  const node = $derived(simplified.nodes.find((one) => one.id === selected.id) ?? null);
  const here = $derived.by(() => {
    if (!node) return null;
    const { own, into, outOf } = atNode(findings, node.id);
    return { own: rank(own, "effect"), into: rank(into, "effect"), outOf: rank(outOf, "effect") };
  });
</script>

{#snippet section(title: string, rows: Finding[], showPlace: boolean)}
  {#if rows.length > 0}
    <h3
      class="text-muted-foreground border-border border-b px-4 pt-3 pb-1.5 text-[0.6875rem] font-semibold"
    >
      {title}
    </h3>
    {#each rows as finding (finding.key)}
      <TestRow
        {finding}
        {showPlace}
        focused={isFocused(finding.place)}
        onLocate={showPlace ? () => focusOn(finding.place) : undefined}
      />
    {/each}
  {/if}
{/snippet}

<aside class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col border-l">
  <!-- `min-h-0` is load-bearing: a flex item's automatic minimum size is its
       content, so without it the scroll root grows past the panel. -->
  <ScrollArea.Root class="min-h-0 flex-1">
    <div class="border-border flex flex-col gap-3 border-b px-4 pt-3.5 pb-3.5">
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <h2 class="text-[0.9375rem] leading-tight font-semibold">Where the groups differ</h2>
          <p class="text-muted-foreground text-[0.6875rem]">
            {formatNumber(significant.length)} significant tests at {formatNumber(nodesDiffering)}
            activities and {formatNumber(edgesDiffering)} edges
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          class="-mt-1 -mr-2"
          aria-label="Hide tests"
          onclick={onClose}
        >
          <X />
        </Button>
      </div>

      {#if spreads.length > 0}
        <div class="flex flex-col gap-1.5">
          {#each spreads as row (row.attribute)}
            {@const share = (row.significant / row.tested) * 100}
            <div class="grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] items-center gap-2">
              <span class="truncate text-[0.6875rem] font-medium">
                <AttributeName name={row.attribute} />
              </span>
              <span class="bg-muted relative h-1.5">
                <span class="bg-primary absolute inset-y-0 left-0" style="width:{share}%"></span>
              </span>
              <span class="text-muted-foreground text-right font-mono text-[0.625rem]">
                {row.significant}/{row.tested}
              </span>
            </div>
          {/each}
          <span class="text-muted-foreground text-[0.625rem]">
            Places on the graph where each attribute differs, of those tested
          </span>
        </div>
      {/if}

      {#if top.length > 0}
        <div class="flex flex-col gap-1">
          <span class="text-[0.6875rem] font-semibold">Strongest differences</span>
          {#each top as finding (finding.key)}
            <button
              type="button"
              class="hover:bg-muted flex w-full cursor-pointer items-center gap-2 px-1.5 py-1 text-left {isFocused(
                finding.place
              )
                ? 'bg-muted'
                : ''}"
              onclick={() => focusOn(finding.place)}
            >
              {#if finding.place.kind === "edge"}
                <ArrowRight class="text-muted-foreground size-3 shrink-0" aria-hidden="true" />
              {:else}
                <Square class="text-muted-foreground size-2.5 shrink-0" aria-hidden="true" />
              {/if}
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-[0.6875rem] font-medium">{finding.place.label}</span>
                <span class="text-muted-foreground truncate text-[0.625rem]">
                  <AttributeName name={finding.attribute} />
                </span>
              </span>
              <EffectChip test={finding.block.test} />
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if node && here}
      <div class="flex flex-col gap-0.5 px-4 pt-3.5 pb-1">
        <span class="text-muted-foreground text-[0.625rem]">Selected activity</span>
        <h2 class="text-sm leading-tight font-semibold text-pretty">{node.label}</h2>
      </div>
      {@render section("Attributes at this activity", here.own, false)}
      {@render section("Waiting Time on edges in", here.into, true)}
      {@render section("Waiting Time on edges out", here.outOf, true)}
      {#if here.own.length + here.into.length + here.outOf.length === 0}
        <p class="text-muted-foreground px-4 py-3 text-xs">Nothing was tested at this activity.</p>
      {/if}
    {:else}
      <Separator />
      <div class="text-muted-foreground flex flex-col items-center gap-2 p-6">
        <MousePointerClick class="size-5" aria-hidden="true" />
        <p class="text-center text-xs">
          Select an activity, or a difference above, to read its tests.
        </p>
      </div>
    {/if}
  </ScrollArea.Root>
</aside>

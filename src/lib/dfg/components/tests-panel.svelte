<script lang="ts">
  /**
   * Every Significance Test on the drawn graph, attribute by attribute: how
   * widely each one differs, and under it every activity or edge that measured
   * it, strongest first.
   */
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import PlaceTest from "$lib/dfg/components/place-test.svelte";
  import { TRANSITION_TIME } from "$lib/analysis/attributes";
  import { byAttribute, type Finding, type Ranking } from "$lib/dfg/utils/findings";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import { formatNumber } from "$lib/format";
  import { cn } from "$lib/utils";
  import { SvelteSet } from "svelte/reactivity";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import X from "@lucide/svelte/icons/x";

  let {
    findings,
    groupCount,
    onClose,
    onCompare,
    onChooseAttributes
  }: {
    findings: Finding[];
    groupCount: number;
    onClose: () => void;
    onCompare: () => void;
    onChooseAttributes: () => void;
  } = $props();

  let by = $state<Ranking>("effect");
  let onlyDifferences = $state(false);

  const tested = $derived(findings.filter((finding) => finding.block.test).length);
  const significant = $derived(
    findings.filter((finding) => finding.block.test?.significant).length
  );
  const attributes = $derived(byAttribute(findings, by));

  /** Attributes the user flipped from how they start: the first open, the rest closed. */
  const flipped = new SvelteSet<string>();
  const isOpen = (attribute: string) =>
    (attribute === attributes[0]?.attribute) !== flipped.has(attribute);

  const where = (attribute: string, count: number) =>
    attribute === TRANSITION_TIME
      ? `${count} edge${count === 1 ? "" : "s"}`
      : `${count} activit${count === 1 ? "y" : "ies"}`;
</script>

<aside
  class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col border-l"
  data-tour="dfg-tests-panel"
>
  <div class="border-border flex shrink-0 flex-col gap-2.5 border-b px-4 pt-3.5 pb-3">
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-[0.9375rem] leading-tight font-semibold">Where the groups differ</h2>
        {#if groupCount > 1 && findings.length > 0}
          <p class="text-muted-foreground text-[0.6875rem]">
            {formatNumber(significant)} significant of {formatNumber(tested)} tests on what the graph
            shows
          </p>
        {/if}
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
    {#if groupCount > 1 && findings.length > 0}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="flex items-center gap-1.5">
          <Label class="text-muted-foreground text-[0.625rem]">Rank by</Label>
          <ToggleGroup.Root
            type="single"
            size="sm"
            variant="outline"
            value={by}
            onValueChange={(value) => {
              if (value) by = value as Ranking;
            }}
          >
            <ToggleGroup.Item value="effect" class="text-[0.6875rem]">Effect</ToggleGroup.Item>
            <ToggleGroup.Item value="pValue" class="text-[0.6875rem]">p-value</ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
        <Label class="text-muted-foreground flex items-center gap-1.5 text-[0.625rem]">
          <Checkbox bind:checked={onlyDifferences} />
          Only differences
        </Label>
      </div>
    {/if}
  </div>

  {#if groupCount < 2}
    <div class="flex flex-col items-start gap-2.5 p-4">
      <p class="text-muted-foreground text-xs">
        One-group mode: there is nothing to test against. Compare two groups to see where they
        differ.
      </p>
      <Button size="sm" onclick={onCompare}>Choose a second group</Button>
    </div>
  {:else if findings.length === 0}
    <div class="flex flex-col items-start gap-2.5 p-4">
      <p class="text-muted-foreground text-xs">
        No attributes are tested. Choose some to see where the groups differ.
      </p>
      <Button variant="outline" size="sm" onclick={onChooseAttributes}>Choose attributes</Button>
    </div>
  {:else}
    <!-- `min-h-0` is load-bearing: a flex item's automatic minimum size is its
         content, so without it the scroll root grows past the panel. -->
    <ScrollArea.Root class="min-h-0 flex-1">
      {#each attributes as row (row.attribute)}
        {@const open = isOpen(row.attribute)}
        {@const share = row.tested > 0 ? (row.significant / row.tested) * 100 : 0}
        {@const places = onlyDifferences
          ? row.places.filter((finding) => finding.block.test?.significant)
          : row.places}
        <Collapsible.Root
          {open}
          onOpenChange={() =>
            flipped.has(row.attribute) ? flipped.delete(row.attribute) : flipped.add(row.attribute)}
          class={cn("border-border border-b", open && "bg-background")}
        >
          <Collapsible.Trigger
            class="hover:bg-muted grid w-full cursor-pointer grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 pr-4 pl-3 text-left"
          >
            <ChevronRight
              class={cn("text-muted-foreground size-3.5 transition-transform", open && "rotate-90")}
              aria-hidden="true"
            />
            <span class="flex min-w-0 flex-col gap-1">
              <span class="truncate text-[0.8125rem] font-semibold">
                <AttributeName name={row.attribute} />
              </span>
              <span class="bg-muted relative h-1.5">
                <span class="bg-primary absolute inset-y-0 left-0" style="width:{share}%"></span>
              </span>
              <span class="text-muted-foreground truncate text-[0.625rem]">
                differs at {row.significant} of {where(row.attribute, row.tested)}
              </span>
            </span>
            <EffectMeter test={row.peak?.block.test} />
          </Collapsible.Trigger>
          <Collapsible.Content>
            {#each places as finding (finding.key)}
              <PlaceTest {finding} />
            {:else}
              <p class="text-muted-foreground border-border border-t px-6 py-2.5 text-[0.6875rem]">
                No place on the graph differs on this attribute.
              </p>
            {/each}
          </Collapsible.Content>
        </Collapsible.Root>
      {/each}
    </ScrollArea.Root>
  {/if}
</aside>

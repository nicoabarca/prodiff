<script lang="ts">
  /**
   * Prototype B: every Significance Test on the drawn graph in one list, ranked,
   * or grouped by attribute to show how widely each one differs. A row frames its
   * activity or edge on the canvas.
   */
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import TestRow from "$lib/dfg/components/prototypes/test-row.svelte";
  import { focusOn, isFocused } from "$lib/dfg/state/prototypes/focus.svelte";
  import { rank, spread, type Finding, type Ranking } from "$lib/dfg/utils/prototypes/findings";
  import EffectMeter from "$lib/tree/components/effect-meter.svelte";
  import { formatNumber } from "$lib/format";
  import { cn } from "$lib/utils";
  import { SvelteSet } from "svelte/reactivity";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import X from "@lucide/svelte/icons/x";

  let { findings, onClose }: { findings: Finding[]; onClose: () => void } = $props();

  type Where = "all" | "node" | "edge";

  let mode = $state<"ranking" | "attribute">("ranking");
  let by = $state<Ranking>("effect");
  let where = $state<Where>("all");
  let everything = $state(false);
  const expanded = new SvelteSet<string>();

  const tested = $derived(findings.filter((finding) => finding.block.test));
  const significant = $derived(tested.filter((finding) => finding.block.test?.significant));
  const places = $derived(new Set(significant.map((finding) => finding.place.label)).size);

  const listed = $derived(
    rank(
      (everything ? findings : significant).filter(
        (finding) => where === "all" || finding.place.kind === where
      ),
      by
    )
  );
  const spreads = $derived(spread(findings));
</script>

<aside class="border-border bg-sidebar flex w-[26rem] shrink-0 flex-col border-l">
  <div class="border-border flex shrink-0 flex-col gap-2.5 border-b px-4 pt-3.5 pb-3">
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 flex-col gap-1">
        <h2 class="text-[0.9375rem] leading-tight font-semibold">Where the groups differ</h2>
        <p class="text-muted-foreground text-[0.6875rem]">
          {formatNumber(significant.length)} significant of {formatNumber(tested.length)} tests, at
          {formatNumber(places)} places on the graph
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
  </div>

  <Tabs.Root
    value={mode}
    onValueChange={(value) => (mode = value as typeof mode)}
    class="flex min-h-0 flex-1 flex-col gap-0"
  >
    <div class="border-border flex h-9 shrink-0 items-stretch border-b px-4">
      <Tabs.List variant="line" class="h-full gap-1 p-0">
        <Tabs.Trigger value="ranking" class="h-full flex-none px-1.5 text-[0.6875rem] after:bottom-0">
          Ranking
        </Tabs.Trigger>
        <Tabs.Trigger
          value="attribute"
          class="h-full flex-none px-1.5 text-[0.6875rem] after:bottom-0"
        >
          By attribute
        </Tabs.Trigger>
      </Tabs.List>
    </div>

    <Tabs.Content value="ranking" class="flex min-h-0 flex-1 flex-col">
      <div class="border-border flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
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
        <ToggleGroup.Root
          type="single"
          size="sm"
          variant="outline"
          value={where}
          onValueChange={(value) => {
            if (value) where = value as Where;
          }}
        >
          <ToggleGroup.Item value="all" class="text-[0.6875rem]">All</ToggleGroup.Item>
          <ToggleGroup.Item value="node" class="text-[0.6875rem]">Activities</ToggleGroup.Item>
          <ToggleGroup.Item value="edge" class="text-[0.6875rem]">Edges</ToggleGroup.Item>
        </ToggleGroup.Root>
        <Label class="text-muted-foreground flex items-center gap-1.5 text-[0.625rem]">
          <Checkbox bind:checked={everything} />
          Include not significant
        </Label>
      </div>
      <!-- `min-h-0` is load-bearing: a flex item's automatic minimum size is its
           content, so without it the scroll root grows past the panel. -->
      <ScrollArea.Root class="min-h-0 flex-1">
        {#each listed as finding (finding.key)}
          <TestRow
            {finding}
            showPlace
            focused={isFocused(finding.place)}
            onLocate={() => focusOn(finding.place)}
          />
        {:else}
          <p class="text-muted-foreground px-4 py-3.5 text-xs">
            No test came out significant on what the graph shows.
          </p>
        {/each}
      </ScrollArea.Root>
    </Tabs.Content>

    <Tabs.Content value="attribute" class="flex min-h-0 flex-1 flex-col">
      <ScrollArea.Root class="min-h-0 flex-1">
        {#each spreads as row (row.attribute)}
          {@const share = row.tested > 0 ? (row.significant / row.tested) * 100 : 0}
          {@const spots = rank(
            findings.filter((f) => f.attribute === row.attribute && f.block.test?.significant),
            "effect"
          )}
          {@const open = expanded.has(row.attribute)}
          <Collapsible.Root
            {open}
            onOpenChange={(value) =>
              value ? expanded.add(row.attribute) : expanded.delete(row.attribute)}
            class="border-border border-b"
          >
            <Collapsible.Trigger
              class="hover:bg-muted grid w-full cursor-pointer grid-cols-[0.875rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 pr-4 pl-3 text-left"
            >
              <ChevronRight
                class={cn("text-muted-foreground size-3.5 transition-transform", open && "rotate-90")}
                aria-hidden="true"
              />
              <span class="flex min-w-0 flex-col gap-1">
                <span class="truncate text-xs font-semibold">
                  <AttributeName name={row.attribute} />
                </span>
                <span class="bg-muted relative h-1.5">
                  <span class="bg-primary absolute inset-y-0 left-0" style="width:{share}%"></span>
                </span>
                <span class="text-muted-foreground truncate text-[0.625rem]">
                  differs at {row.significant} of {row.tested} places{row.peak
                    ? ` · strongest at ${row.peak.place.label}`
                    : ""}
                </span>
              </span>
              <EffectMeter test={row.peak?.block.test} />
            </Collapsible.Trigger>
            <Collapsible.Content class="bg-background">
              {#each spots as finding (finding.key)}
                <TestRow
                  {finding}
                  showPlace
                  focused={isFocused(finding.place)}
                  onLocate={() => focusOn(finding.place)}
                />
              {:else}
                <p class="text-muted-foreground px-4 py-2.5 text-[0.6875rem]">
                  No place on the graph differs on this attribute.
                </p>
              {/each}
            </Collapsible.Content>
          </Collapsible.Root>
        {:else}
          <p class="text-muted-foreground px-4 py-3.5 text-xs">No attribute was tested.</p>
        {/each}
      </ScrollArea.Root>
    </Tabs.Content>
  </Tabs.Root>
</aside>

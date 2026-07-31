<script lang="ts">
  /**
   * Which Variants the tree is built from. A Variant is one path from root to
   * leaf — a trace some case actually followed — and picking them is a build
   * input, not a view filter: the cut runs before any aggregation, so the
   * Significance Tests describe exactly the Variants included.
   *
   * Checking a box therefore prunes the canvas at once but marks the tree
   * stale, and only Rebuild makes the numbers honest again. Same contract the
   * Variant slider had, with the count replaced by the set.
   *
   * The list comes from `list_variants`, not from the tree, so it reaches every
   * Variant the filtered log has — including the ones no build ever included,
   * which is what the slider could never do.
   *
   * A row can only ever preview a Variant — one truncated line. Hovering it
   * flies the trace out to the right, top to bottom, one card per activity,
   * which is the shape a case actually followed.
   */
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import VirtualList from "$lib/components/virtual-list.svelte";
  import { formatNumber } from "$lib/format";
  import { totalCases, visibleNodes, type DirectedTree, type VariantRow } from "$lib/tree";
  import {
    groupSlices,
    loadVariants,
    selectedVariants,
    setSelectedVariants,
    settings,
    toggleVariant,
    variants,
    view
  } from "$lib/state/tree.svelte";
  import type { Project } from "$lib/types";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  let { project, tree }: { project: Project; tree: DirectedTree | null } = $props();

  let open = $state(false);
  let selectedOnly = $state(false);

  const selected = $derived(selectedVariants());

  // Fetching on open rather than on mount: a user who never picks Variants
  // never pays for the scan.
  $effect(() => {
    if (open) loadVariants(project);
  });

  const totals = $derived({
    a: variants.rows.reduce((sum, row) => sum + row.casesA, 0),
    b: variants.rows.reduce((sum, row) => sum + row.casesB, 0)
  });
  const comparing = $derived(totals.b > 0);

  // The slices are what the user named and coloured in Filters; "Group A" is
  // internal vocabulary they never chose.
  const groupNames = $derived.by(() => {
    const [a, b] = groupSlices();
    return { a: a?.name ?? "Group A", b: b?.name ?? "Group B" };
  });

  function share(cases: number, total: number): string {
    return total > 0 ? `${((cases / total) * 100).toFixed(1)}%` : "—";
  }

  /**
   * A Variant's number is its rank in the full list — most cases first, the
   * order `list_variants` ships. Numbering the rendered rows instead would
   * renumber everything whenever the list is narrowed.
   */
  const numbers = $derived(new Map(variants.rows.map((row, i) => [row.key, i + 1])));

  const rows = $derived(
    selectedOnly ? variants.rows.filter((row) => selected.has(row.key)) : variants.rows
  );

  /** What the toolbar says: the tree on screen, not the selection pending on it. */
  const onScreen = $derived.by(() => {
    if (!tree) return null;
    const visible = visibleNodes(tree, view, selected);
    const total = totalCases(tree);
    return {
      variantsShown: visible.variantsShown,
      variantsTotal: tree.variantsTotal,
      casesShown: visible.casesShown,
      total,
      share: total > 0 ? Math.round((visible.casesShown / total) * 100) : 0
    };
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        class="hover:bg-accent -mx-2 flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left"
      >
        <span class="flex flex-col gap-0.5">
          {#if onScreen}
            <span class="flex items-baseline gap-2 whitespace-nowrap">
              <span class="text-base leading-none font-semibold tabular-nums">
                {formatNumber(onScreen.variantsShown)} of {formatNumber(onScreen.variantsTotal)}
                variants
              </span>
              <span class="text-muted-foreground text-xs tabular-nums">
                {onScreen.share}% of cases
              </span>
            </span>
            <span class="text-muted-foreground text-[0.625rem]">
              {formatNumber(onScreen.casesShown)} of {formatNumber(onScreen.total)} cases on screen
            </span>
          {:else}
            <span class="text-base leading-none font-semibold">Select variants</span>
          {/if}
        </span>
        <ChevronDown class="text-muted-foreground size-4 shrink-0" />
      </button>
    {/snippet}
  </Popover.Trigger>

  <!-- Anchored left so the hover flyout has room on the right. -->
  <Popover.Content align="start" class="flex max-h-[70vh] w-80 flex-col gap-3 p-3">
    <div class="flex shrink-0 flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="ghost"
        onclick={() => setSelectedVariants(project, [])}
        disabled={selected.size === 0}
      >
        Clear
      </Button>
      <span class="ml-auto text-xs tabular-nums">
        Selected: <span class="font-semibold">{formatNumber(selected.size)}</span>
      </span>
    </div>

    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <label class="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox checked={selectedOnly} onCheckedChange={(v) => (selectedOnly = v === true)} />
        Show selected only
      </label>
    </div>

    {#if variants.dropped > 0}
      <p class="text-muted-foreground shrink-0 text-xs">
        {formatNumber(variants.dropped)} selected {variants.dropped === 1 ? "variant" : "variants"}
        no longer {variants.dropped === 1 ? "exists" : "exist"} under these filters.
      </p>
    {/if}
    {#if variants.error}
      <p class="text-destructive shrink-0 text-xs">{variants.error}</p>
    {/if}

    <div
      class="text-muted-foreground flex shrink-0 items-center gap-3 border-b pb-1 text-[0.625rem] uppercase"
    >
      <span class="w-6"></span>
      <span class="shrink-0 whitespace-nowrap">Variant</span>
      <span class="text-slice-1 ml-auto flex w-28 flex-col items-end truncate text-right">
        <span class="truncate">{comparing ? groupNames.a : "Cases"}</span>
        <span class="text-[0.625rem] font-normal normal-case opacity-70">(cases)</span>
      </span>
      <span class="text-slice-2 flex w-28 flex-col items-end truncate text-right">
        <span class="truncate">{comparing ? groupNames.b : "Cases"}</span>
        <span class="text-[0.625rem] font-normal normal-case opacity-70">(cases)</span>
      </span>
    </div>

    {#if variants.loading}
      <div class="flex flex-col gap-2">
        {#each Array(8) as _, i (i)}
          <Skeleton class="h-8 w-full" />
        {/each}
      </div>
    {:else}
      <VirtualList items={rows} rowHeight={44}>
        {#snippet row(item: VariantRow)}
          <label
            class="hover:bg-accent/50 flex h-11 cursor-pointer items-center gap-3 rounded px-1 text-xs"
          >
            <Checkbox
              checked={selected.has(item.key)}
              onCheckedChange={() => toggleVariant(project, item.key)}
              aria-label="Include this variant"
            />
            <!-- The anchor is the whole row, not the label: `side="right"`
                 measures from the trigger, so a narrow trigger would drop the
                 trace on top of the list instead of beside the panel. -->
            <HoverCard.Root openDelay={0} closeDelay={0}>
              <HoverCard.Trigger>
                {#snippet child({ props })}
                  <div {...props} class="flex min-w-0 flex-1 items-center gap-3">
                    <span class="shrink-0 whitespace-nowrap tabular-nums">
                      Variant {numbers.get(item.key)}
                    </span>
                    <!-- Same colours the canvas gives the Groups, so a column
                         reads as the same thing as a node's A/B line. An absent
                         Variant gets a grey dash instead of a coloured zero:
                         "only in one group" should be visible at a glance. -->
                    <span class="ml-auto flex w-28 flex-col items-end tabular-nums">
                      {#if item.casesA > 0}
                        <span class="text-slice-1">{formatNumber(item.casesA)}</span>
                        <span class="text-slice-1 text-[0.625rem] opacity-70">
                          {share(item.casesA, totals.a)}
                        </span>
                      {:else}
                        <span class="text-muted-foreground">—</span>
                      {/if}
                    </span>
                    {#if comparing}
                      <span class="flex w-28 flex-col items-end tabular-nums">
                        {#if item.casesB > 0}
                          <span class="text-slice-2">{formatNumber(item.casesB)}</span>
                          <span class="text-slice-2 text-[0.625rem] opacity-70">
                            {share(item.casesB, totals.b)}
                          </span>
                        {:else}
                          <span class="text-muted-foreground">—</span>
                        {/if}
                      </span>
                    {/if}
                  </div>
                {/snippet}
              </HoverCard.Trigger>
              <!-- The whole trace, top to bottom, out to the side of the list. -->
              <HoverCard.Content
                side="right"
                align="start"
                class="flex max-h-[70vh] w-72 flex-col gap-1 overflow-y-auto"
              >
                {#each item.activities as activity, i (i)}
                  {#if i > 0}
                    <ArrowDown class="text-muted-foreground size-3 shrink-0 self-center" />
                  {/if}
                  <div class="flex w-full items-baseline gap-1">
                    <span class="text-muted-foreground shrink-0 text-[0.625rem] tabular-nums">
                      {i + 1}
                    </span>
                    <div class="bg-muted/40 min-w-0 flex-1 rounded border px-2 py-1 text-center">
                      {activity}
                    </div>
                  </div>
                {/each}
              </HoverCard.Content>
            </HoverCard.Root>
          </label>
        {/snippet}
        {#snippet empty()}
          <p class="text-muted-foreground p-4 text-xs">
            {selectedOnly ? "No variants are selected yet." : "No variants in this log."}
          </p>
        {/snippet}
      </VirtualList>
    {/if}

    <p class="text-muted-foreground shrink-0 text-[0.625rem]">
      Showing {formatNumber(rows.length)} of {formatNumber(variants.rows.length)} variants
      {#if settings.value.selectedVariants.length === 0}
        · nothing selected yet, so the tree opens on the most common variants
      {/if}
    </p>
  </Popover.Content>
</Popover.Root>

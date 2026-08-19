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
   * A row names a Variant but cannot show one. Clicking it does: lit up on the
   * canvas when the tree already draws that Variant, and otherwise as a trace
   * beside the panel — one card per activity, top to bottom, which is the
   * shape a case actually followed.
   */
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import VirtualList from "$lib/components/virtual-list.svelte";
  import { formatNumber } from "$lib/format";
  import {
    totalCases,
    variantPath,
    visibleNodes,
    type DirectedTree,
    type VariantRow
  } from "$lib/tree";
  import {
    groupSlices,
    shownVariant,
    loadVariants,
    selectedVariants,
    setSelectedVariants,
    settings,
    toggleVariant,
    variants,
    view
  } from "$lib/state/tree.svelte";
  import { baseSlice, loadImpact, sliceCases } from "$lib/state/slices.svelte";
  import type { Project } from "$lib/event-log/types";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import X from "@lucide/svelte/icons/x";

  let { project, tree }: { project: Project; tree: DirectedTree | null } = $props();

  let open = $state(false);
  let selectedOnly = $state(false);
  /** The Variant whose trace is on screen — clicked open, clicked closed. */
  let preview = $state<string | null>(null);

  const selected = $derived(selectedVariants());

  // Fetching on open rather than on mount: a user who never picks Variants
  // never pays for the scan.
  $effect(() => {
    if (open) loadVariants(project);
    // Closing the picker puts the tree back the way it was: a dimmed canvas
    // with no panel in sight has nothing left to explain it.
    else {
      preview = null;
      shownVariant.key = null;
    }
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
   * Cases in the Base slice — the population both Groups are carved out of.
   * Measured lazily and cached by `loadImpact`, so it is `null` until the scan
   * lands and the share it feeds simply isn't drawn until then.
   */
  const base = $derived(baseSlice());
  const baseCases = $derived(base ? sliceCases(base) : null);
  $effect(() => {
    if (open && base) loadImpact(project, base);
  });

  /**
   * A Variant's number is its rank in the full list — most cases first, the
   * order `list_variants` ships. Numbering the rendered rows instead would
   * renumber everything whenever the list is narrowed.
   */
  const numbers = $derived(new Map(variants.rows.map((row, i) => [row.key, i + 1])));

  const rows = $derived(
    selectedOnly ? variants.rows.filter((row) => selected.has(row.key)) : variants.rows
  );

  // Looked up rather than stored, so a reload that drops the Variant closes
  // its trace instead of showing a stale one.
  const previewRow = $derived(variants.rows.find((row) => row.key === preview) ?? null);

  const visible = $derived(tree ? visibleNodes(tree, view, selected) : null);

  /**
   * Clicking a row shows the Variant where it is most useful. One the tree
   * already draws is lit up on the canvas — the trace pane would only cover
   * the thing it describes. One the tree doesn't have gets the pane, since
   * there is nothing on screen to point at.
   */
  function show(key: string) {
    if (tree && visible && variantPath(tree, visible, key).size > 0) {
      preview = null;
      shownVariant.key = shownVariant.key === key ? null : key;
      return;
    }
    shownVariant.key = null;
    preview = preview === key ? null : key;
  }

  /** What the toolbar says: the tree on screen, not the selection pending on it. */
  const onScreen = $derived.by(() => {
    if (!tree || !visible) return null;
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
  <Popover.Content align="start" class="relative flex max-h-[70vh] w-80 flex-col gap-3 p-3">
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

    <p class="text-muted-foreground shrink-0 text-[0.625rem] leading-relaxed">
      Click a row to show its variant — lit on the tree, or listed step by step when the tree has no
      such path. The checkbox includes it in the build.
      <br />
      Per cell: cases · <span class="opacity-70">% of that group</span> ·
      <span class="text-foreground">% of base </span>{#if baseCases}
        ({formatNumber(baseCases)} cases){/if}.
    </p>

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
      <!-- The Group's own total, so a row's share has its denominator in
           sight. Summed over the Variant list, which is every case the
           filtered log has — not what any build happened to include. -->
      <span class="text-slice-1 ml-auto flex w-28 flex-col items-end truncate text-right">
        <span class="truncate">{comparing ? groupNames.a : "Cases"}</span>
        <span class="text-[0.625rem] font-normal normal-case tabular-nums opacity-70">
          ({formatNumber(totals.a)} cases)
        </span>
      </span>
      <span class="text-slice-2 flex w-28 flex-col items-end truncate text-right">
        <span class="truncate">{comparing ? groupNames.b : "Cases"}</span>
        <span class="text-[0.625rem] font-normal normal-case tabular-nums opacity-70">
          ({formatNumber(totals.b)} cases)
        </span>
      </span>
    </div>

    {#if variants.loading}
      <div class="flex flex-col gap-2">
        {#each Array(8) as _, i (i)}
          <Skeleton class="h-8 w-full" />
        {/each}
      </div>
    {:else}
      <VirtualList items={rows} rowHeight={56}>
        {#snippet row(item: VariantRow)}
          <!-- A row is two controls, not one: the checkbox includes the
               Variant in the build, the rest of the row only shows its trace.
               Hence a plain div — a `<label>` would make every click on the
               row a selection. -->
          <div
            class="flex h-14 items-center gap-3 rounded px-1 text-xs {preview === item.key ||
            shownVariant.key === item.key
              ? 'bg-accent'
              : 'hover:bg-accent/50'}"
          >
            <Checkbox
              checked={selected.has(item.key)}
              onCheckedChange={() => toggleVariant(project, item.key)}
              aria-label="Include variant {numbers.get(item.key)} in the build"
            />
            <button
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              aria-pressed={preview === item.key || shownVariant.key === item.key}
              onclick={() => show(item.key)}
            >
              <span class="shrink-0 whitespace-nowrap tabular-nums">
                Variant {numbers.get(item.key)}
              </span>
              <!-- Same colours the canvas gives the Groups, so a column reads
                   as the same thing as a node's A/B line. An absent Variant
                   gets a grey dash instead of a coloured zero: "only in one
                   group" should be visible at a glance. -->
              <span class="ml-auto flex w-28 flex-col items-end tabular-nums">
                {#if item.casesA > 0}
                  <span class="text-slice-1">{formatNumber(item.casesA)}</span>
                  <span class="text-slice-1 text-[0.625rem] opacity-70">
                    {share(item.casesA, totals.a)}
                  </span>
                  {#if baseCases}
                    <span class="text-[0.625rem]">{share(item.casesA, baseCases)}</span>
                  {/if}
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
                    {#if baseCases}
                      <span class="text-[0.625rem]">{share(item.casesB, baseCases)}</span>
                    {/if}
                  {:else}
                    <span class="text-muted-foreground">—</span>
                  {/if}
                </span>
              {/if}
            </button>
          </div>
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

    {#if previewRow}
      <!-- Positioned off the panel rather than off the row, so step 1 is in
           the same place for every Variant. A child of the panel instead of a
           second floating layer: no second dismiss handler to fight the
           popover's own. -->
      <div
        class="bg-popover text-popover-foreground ring-foreground/10 absolute top-0 left-full ml-2 flex max-h-[70vh] w-72 flex-col gap-1 overflow-y-auto p-2.5 text-xs shadow-md ring-1"
      >
        <div class="mb-1 flex shrink-0 items-center justify-between gap-2">
          <span class="font-semibold tabular-nums">
            Variant {numbers.get(previewRow.key)}
          </span>
          <button
            class="text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Close trace"
            onclick={() => (preview = null)}
          >
            <X class="size-3.5" />
          </button>
        </div>
        {#each previewRow.activities as activity, i (i)}
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
      </div>
    {/if}
  </Popover.Content>
</Popover.Root>

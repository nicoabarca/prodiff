<script lang="ts">
  /** Which Variants the tree is built from. Checking a box marks the tree stale. */
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import VirtualList from "$lib/components/virtual-list/virtual-list.svelte";
  import { colorVar, formatNumber } from "$lib/format";
  import type { ResponseDirectedTree, ResponseVariantRow } from "$lib/tree/invokers/types";
  import { totalCases, variantPath, visibleNodes } from "$lib/tree/utils/tree";
  import { shownVariant, loadVariants, selectedVariants, setSelectedVariants, settings, toggleVariant, variants, view } from "$lib/tree/state/tree.svelte";
  import { comparedGroups } from "$lib/groups/state/comparison.svelte";
  import type { Project } from "$lib/event-log/types";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import X from "@lucide/svelte/icons/x";

  let { project, tree }: { project: Project; tree: ResponseDirectedTree | null } = $props();

  let open = $state(false);
  let selectedOnly = $state(false);
  /** The Variant whose trace is on screen. */
  let preview = $state<string | null>(null);

  const selected = $derived(selectedVariants());

  $effect(() => {
    if (open) loadVariants(project);
    else {
      preview = null;
      shownVariant.key = null;
    }
  });

  // The Groups in the order the tree lists them, so a row's columns are the
  // same Groups the canvas paints.
  const groups = $derived(comparedGroups());
  const casesIn = (row: ResponseVariantRow, id: string) => row.cases[id] ?? 0;

  /** Cases per Group across every Variant, keyed by Group id. */
  const totals = $derived(
    Object.fromEntries(
      groups.map((group) => [
        group.id,
        variants.rows.reduce((sum, row) => sum + casesIn(row, group.id), 0)
      ])
    )
  );

  const accents = $derived(
    Object.fromEntries(groups.map((group) => [group.id, colorVar(group.color)]))
  );

  /** The Groups with a column of their own: the first, plus any that has cases. */
  const columns = $derived(groups.filter((group, index) => index === 0 || totals[group.id] > 0));

  function share(cases: number, total: number): string {
    return total > 0 ? `${((cases / total) * 100).toFixed(1)}%` : "—";
  }

  /** Cases in the whole Event Log, what a Group's share is measured against. */
  const originalCases = $derived(project.cases);

  /** A Variant's number is its rank in the full list, so narrowing never renumbers. */
  const numbers = $derived(new Map(variants.rows.map((row, i) => [row.key, i + 1])));

  const rows = $derived(
    selectedOnly ? variants.rows.filter((row) => selected.has(row.key)) : variants.rows
  );

  // Looked up, not stored, so a reload that drops the Variant closes its trace.
  const previewRow = $derived(variants.rows.find((row) => row.key === preview) ?? null);

  const visible = $derived(tree ? visibleNodes(tree, view, selected) : null);

  /** Clicking a row lights the Variant on the canvas, or opens the trace pane. */
  function show(key: string) {
    if (tree && visible && variantPath(tree, visible, key).size > 0) {
      preview = null;
      shownVariant.key = shownVariant.key === key ? null : key;
      return;
    }
    shownVariant.key = null;
    preview = preview === key ? null : key;
  }

  /** What the toolbar says: the tree on screen, not the pending selection. */
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
      Click a row to show its variant: lit on the tree, or listed step by step when the tree has no
      such path. The checkbox includes it in the build.
      <br />
      Per cell: cases · <span class="opacity-70">% of that group</span> ·
      <span class="text-foreground">% of the event log </span>{#if originalCases}
        ({formatNumber(originalCases)} cases){/if}.
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
      {#each columns as group, index (group.id)}
        <span
          class="flex w-28 flex-col items-end truncate text-right {index === 0 ? 'ml-auto' : ''}"
          style="color:{accents[group.id]}"
        >
          <span class="truncate">{columns.length > 1 ? group.name : "Cases"}</span>
          <span class="text-[0.625rem] font-normal normal-case tabular-nums opacity-70">
            ({formatNumber(totals[group.id])} cases)
          </span>
        </span>
      {/each}
    </div>

    {#if variants.loading}
      <div class="flex flex-col gap-2">
        {#each Array(8) as _, i (i)}
          <Skeleton class="h-8 w-full" />
        {/each}
      </div>
    {:else}
      <VirtualList items={rows} rowHeight={56}>
        {#snippet row(item: ResponseVariantRow)}
          <!-- A plain div, not a `<label>`: the checkbox includes the Variant in the
               build, the rest of the row only shows its trace. -->
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
              {#each columns as group, index (group.id)}
                {@const cases = casesIn(item, group.id)}
                <span
                  class="flex w-28 flex-col items-end tabular-nums {index === 0 ? 'ml-auto' : ''}"
                >
                  {#if cases > 0}
                    <span style="color:{accents[group.id]}">{formatNumber(cases)}</span>
                    <span class="text-[0.625rem] opacity-70" style="color:{accents[group.id]}">
                      {share(cases, totals[group.id])}
                    </span>
                    {#if originalCases}
                      <span class="text-[0.625rem]">{share(cases, originalCases)}</span>
                    {/if}
                  {:else}
                    <span class="text-muted-foreground">—</span>
                  {/if}
                </span>
              {/each}
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

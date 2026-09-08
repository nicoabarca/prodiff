<script lang="ts">
  /**
   * Which Variants the next build is made of. Everything here edits a staged
   * selection; only Apply writes it through, and only then does the tree read
   * stale.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import VirtualList from "$lib/components/virtual-list/virtual-list.svelte";
  import { colorVar, formatNumber } from "$lib/format";
  import type { ResponseDirectedTree, ResponseVariantRow } from "$lib/tree/invokers/types";
  import {
    applyStaged,
    comparedGroups,
    isStagedDirty,
    loadVariants,
    resetStaged,
    setStaged,
    settings,
    shownVariant,
    stagedVariants,
    toggleStaged,
    variants,
    view
  } from "$lib/tree/state/tree.svelte";
  import { visibleNodes } from "$lib/tree/utils/tree";
  import { variantCases, variantsCovering } from "$lib/tree/utils/variants";
  import VariantRow from "$lib/tree/components/variant-row.svelte";
  import type { Project } from "$lib/event-log/types";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";

  let {
    project,
    tree,
    onClose
  }: { project: Project; tree: ResponseDirectedTree | null; onClose: () => void } = $props();

  const MIN_WIDTH = 28.75;
  const MAX_WIDTH = 61.25;
  const ROW_HEIGHT = 88;
  /** What the minus and plus buttons move the coverage by, in percent. */
  const COVERAGE_STEP = 10;

  /** Panel width in rem, dragged on the handle at its right edge. */
  let width = $state(40);

  $effect(() => {
    loadVariants(project);
  });

  const staged = $derived(stagedVariants());
  const dirty = $derived(isStagedDirty());
  const applied = $derived(settings.value.selectedVariants.length);

  const groups = $derived(comparedGroups());
  const accents = $derived(
    Object.fromEntries(groups.map((group) => [group.id, colorVar(group.color)]))
  );

  /** Cases per Group across every Variant, keyed by Group id. */
  const totals = $derived(
    Object.fromEntries(
      groups.map((group) => [
        group.id,
        variants.rows.reduce((sum, row) => sum + (row.cases[group.id] ?? 0), 0)
      ])
    )
  );

  /** The Groups with a column of their own: the first, plus any that has cases. */
  const columns = $derived(groups.filter((group, index) => index === 0 || totals[group.id] > 0));

  /** A Variant's number is its rank in the full list, so narrowing never renumbers. */
  const numbers = $derived(new Map(variants.rows.map((row, i) => [row.key, i + 1])));

  const rows = $derived(variants.rows);

  /** The share of all cases the staged Variants hold, in percent. */
  const stagedShare = $derived.by(() => {
    const all = variants.rows.reduce((sum, row) => sum + variantCases(row), 0);
    if (all === 0) return 0;
    const held = variants.rows
      .filter((row) => staged.has(row.key))
      .reduce((sum, row) => sum + variantCases(row), 0);
    return Math.round((held / all) * 100);
  });

  /** The Variants the canvas is drawing, which is what hovering a row can light. */
  const onTree = $derived.by(() => {
    if (!tree) return new Set<string>();
    const visible = visibleNodes(tree, view, new Set(settings.value.selectedVariants));
    return new Set(
      tree.nodes
        .filter((node) => node.variantKey !== null && visible.ids.has(node.id))
        .map((node) => node.variantKey as string)
    );
  });

  /** The least coverage a selection can hold: a build needs one Variant, so the
      biggest one's share is the floor the slider stops at. */
  const minCoverage = $derived.by(() => {
    const all = variants.rows.reduce((sum, row) => sum + variantCases(row), 0);
    if (all === 0) return 1;
    const biggest = variants.rows.reduce((max, row) => Math.max(max, variantCases(row)), 0);
    return Math.max(1, Math.round((biggest / all) * 100));
  });

  /** What the slider sits on: the coverage held, never below the floor it stops at. */
  const coverage = $derived(Math.max(stagedShare, minCoverage));

  /** The slider reads the coverage the staged Variants already hold; moving it
      stages the smallest set that reaches the coverage asked for. An empty list
      has no coverage to stage, so it is left alone. */
  function setCoverage(next: number) {
    if (variants.rows.length === 0) return;
    const target = Math.min(100, Math.max(minCoverage, next));
    setStaged(variantsCovering(variants.rows, target / 100));
  }

  function startResize(event: PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const step = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const move = (moved: PointerEvent) => {
      const next = startWidth + (moved.clientX - startX) / step;
      width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    if (dirty) resetStaged();
    else onClose();
  }}
/>

<div class="flex min-h-0 shrink-0" style:width="{width}rem">
  <div class="bg-card flex min-w-0 flex-1 flex-col border-r shadow-lg">
    <div class="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
      <span class="text-[0.8125rem] font-semibold">Variants</span>
      <span
        class="bg-secondary text-secondary-foreground flex h-5 items-center px-2 text-[0.6875rem] font-medium tabular-nums"
      >
        {formatNumber(staged.size)} staged
      </span>
      {#if dirty}
        <span class="text-foreground text-[0.6875rem] font-semibold tabular-nums">
          {formatNumber(applied)} → {formatNumber(staged.size)} variants
        </span>
      {/if}
      <button
        class="text-muted-foreground hover:bg-accent hover:text-foreground ml-auto flex size-6 cursor-pointer items-center justify-center"
        aria-label="Close variants panel"
        onclick={onClose}
      >
        <X class="size-3.5" />
      </button>
    </div>

    <div class="flex shrink-0 flex-col gap-2 border-b px-3 py-2.5">
      <div class="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          class="h-6 px-2 text-[0.6875rem]"
          onclick={() => setStaged(variants.rows.map((r) => r.key))}
        >
          All
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="h-6 px-2 text-[0.6875rem]"
          disabled={staged.size === 0}
          onclick={() => setStaged([])}
        >
          Clear all
        </Button>
        <div class="ml-auto flex min-w-40 flex-1 items-center gap-2">
          <span class="text-muted-foreground text-[0.625rem] whitespace-nowrap">Coverage</span>
          <Slider
            type="single"
            value={coverage}
            onValueChange={setCoverage}
            min={1}
            max={100}
            step={1}
            disabled={variants.rows.length === 0}
            class="flex-1"
          />
          <span
            class="text-muted-foreground w-8 text-right font-mono text-[0.6875rem] tabular-nums"
          >
            {coverage}%
          </span>
          <div class="flex items-center">
            <button
              type="button"
              aria-label="Decrease coverage by 10%"
              class="text-muted-foreground hover:bg-accent hover:text-foreground flex size-5 cursor-pointer items-center justify-center border disabled:pointer-events-none disabled:opacity-50"
              disabled={variants.rows.length === 0 || coverage <= minCoverage}
              onclick={() => setCoverage(coverage - COVERAGE_STEP)}
            >
              <Minus class="size-3" />
            </button>
            <button
              type="button"
              aria-label="Increase coverage by 10%"
              class="text-muted-foreground hover:bg-accent hover:text-foreground -ml-px flex size-5 cursor-pointer items-center justify-center border disabled:pointer-events-none disabled:opacity-50"
              disabled={variants.rows.length === 0}
              onclick={() => setCoverage(coverage + COVERAGE_STEP)}
            >
              <Plus class="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    {#if variants.dropped > 0}
      <p class="text-muted-foreground shrink-0 border-b px-3 py-2 text-xs">
        {formatNumber(variants.dropped)} selected {variants.dropped === 1 ? "variant" : "variants"}
        no longer {variants.dropped === 1 ? "exists" : "exist"} under these filters.
      </p>
    {/if}
    {#if variants.error}
      <p class="text-destructive shrink-0 border-b px-3 py-2 text-xs">{variants.error}</p>
    {/if}

    <div
      class="text-muted-foreground flex shrink-0 items-end gap-2 border-b px-3 pt-1.5 pb-1 text-[0.625rem] tracking-wide uppercase"
    >
      <span class="w-4 shrink-0"></span>
      <span class="w-3.5 shrink-0"></span>
      <span class="w-8 shrink-0">#</span>
      <span class="min-w-0 flex-1"></span>
      {#each columns as group (group.id)}
        <span class="flex shrink-0 flex-col items-end gap-0.5">
          <span class="max-w-44 truncate font-semibold" style="color:{accents[group.id]}">
            {columns.length > 1 ? group.name : "Cases"}
          </span>
          <span class="flex gap-2 text-right">
            <span class="w-14">Cases</span>
            <span class="w-12">% Cases</span>
            <span class="w-14">Events</span>
          </span>
        </span>
      {/each}
    </div>

    {#if variants.loading}
      <div class="flex flex-col gap-2 p-3">
        {#each Array(8) as _, i (i)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    {:else}
      <VirtualList items={rows} rowHeight={ROW_HEIGHT}>
        {#snippet row(item: ResponseVariantRow)}
          <VariantRow
            row={item}
            number={numbers.get(item.key) ?? 0}
            {columns}
            {accents}
            {totals}
            staged={staged.has(item.key)}
            highlighted={shownVariant.key === item.key}
            onTree={onTree.has(item.key)}
            onToggle={() => toggleStaged(item.key)}
            onHighlight={() => (shownVariant.key = shownVariant.key === item.key ? null : item.key)}
          />
        {/snippet}
        {#snippet empty()}
          <p class="text-muted-foreground p-4 text-xs">No variants in this log.</p>
        {/snippet}
      </VirtualList>
    {/if}

    <div class="bg-background flex shrink-0 border-t px-3 py-2.5">
      <div class="flex flex-1 items-center justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={!dirty} onclick={resetStaged}>Reset</Button>
        <Button
          size="sm"
          disabled={!dirty || staged.size === 0}
          title={staged.size === 0 ? "Stage at least one variant" : undefined}
          onclick={() => applyStaged(project)}
        >
          Apply
          {#if dirty}
            <span class="font-medium tabular-nums opacity-85">
              · {formatNumber(staged.size)}
            </span>
          {/if}
        </Button>
      </div>
    </div>
  </div>

  <button
    type="button"
    aria-label="Resize variants panel"
    class="-ml-0.5 w-1.5 shrink-0 cursor-col-resize bg-transparent"
    onpointerdown={startResize}
  ></button>
</div>

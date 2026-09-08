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
  import { activityOptions, filterVariants } from "$lib/tree/utils/variant-filter";
  import { visibleNodes } from "$lib/tree/utils/tree";
  import { variantsCovering } from "$lib/tree/utils/variants";
  import VariantRow from "$lib/tree/components/variant-row.svelte";
  import VariantSequence from "$lib/tree/components/variant-sequence.svelte";
  import type { Project } from "$lib/event-log/types";
  import X from "@lucide/svelte/icons/x";

  let {
    project,
    tree,
    onClose
  }: { project: Project; tree: ResponseDirectedTree | null; onClose: () => void } = $props();

  let sequence = $state<string[]>([]);
  /** The coverage the slider is on, in percent. Never persisted: it makes a
      selection, it does not describe the tree. */
  let coverage = $state(80);

  $effect(() => {
    loadVariants(project);
  });

  $effect(() => {
    return () => {
      shownVariant.key = null;
    };
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

  const rows = $derived(filterVariants(variants.rows, sequence));
  const options = $derived(activityOptions(variants.rows));

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

  const covering = $derived(variantsCovering(variants.rows, coverage / 100));
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    if (dirty) resetStaged();
    else onClose();
  }}
/>

<div
  class="bg-background absolute top-0 bottom-0 left-0 z-20 flex w-96 flex-col gap-3 border-r p-3 shadow-lg"
>
  <div class="flex shrink-0 items-baseline gap-2">
    <span class="text-sm font-semibold">Variants</span>
    <span class="text-muted-foreground text-xs tabular-nums">
      {#if dirty}
        {formatNumber(staged.size)} staged · {formatNumber(applied)} applied
      {:else}
        {formatNumber(staged.size)} selected
      {/if}
    </span>
    <button
      class="text-muted-foreground hover:text-foreground ml-auto cursor-pointer"
      aria-label="Close variants panel"
      onclick={onClose}
    >
      <X class="size-4" />
    </button>
  </div>

  <VariantSequence {options} bind:sequence />

  <div class="flex shrink-0 flex-wrap items-center gap-2">
    <Button size="sm" variant="outline" onclick={() => setStaged(variants.rows.map((r) => r.key))}>
      Stage all
    </Button>
    {#if sequence.length > 0}
      <Button
        size="sm"
        variant="outline"
        onclick={() => setStaged([...staged, ...rows.map((r) => r.key)])}
      >
        Stage filtered ({formatNumber(rows.length)})
      </Button>
    {/if}
    <Button size="sm" variant="ghost" disabled={staged.size === 0} onclick={() => setStaged([])}>
      Clear all
    </Button>
  </div>

  <div class="bg-muted/30 flex shrink-0 flex-col gap-1.5 rounded border p-2">
    <span class="text-xs font-medium">Stage by coverage</span>
    <span class="text-muted-foreground text-[0.625rem]">
      Smallest set of variants covering {coverage}% of cases
      <span class="text-foreground">→ {formatNumber(covering.size)} variants</span>
    </span>
    <Slider type="single" bind:value={coverage} min={1} max={100} step={1} />
    <Button
      size="sm"
      variant="outline"
      class="self-start"
      disabled={variants.rows.length === 0}
      onclick={() => setStaged(covering)}
    >
      Stage these {formatNumber(covering.size)}
    </Button>
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
    class="text-muted-foreground flex shrink-0 items-end gap-2 border-b pb-1 text-[0.625rem] uppercase"
  >
    <span class="flex-1">Variant</span>
    {#each columns as group (group.id)}
      <span class="flex w-28 shrink-0 flex-col items-end" style="color:{accents[group.id]}">
        <span class="max-w-full truncate">{columns.length > 1 ? group.name : "Cases"}</span>
        <span class="text-[0.625rem] font-normal normal-case tabular-nums opacity-70">
          ({formatNumber(totals[group.id])} cases)
        </span>
      </span>
    {/each}
  </div>

  {#if variants.loading}
    <div class="flex flex-col gap-2">
      {#each Array(8) as _, i (i)}
        <Skeleton class="h-16 w-full" />
      {/each}
    </div>
  {:else}
    <VirtualList items={rows} rowHeight={64}>
      {#snippet row(item: ResponseVariantRow)}
        <VariantRow
          row={item}
          number={numbers.get(item.key) ?? 0}
          {columns}
          {accents}
          {totals}
          staged={staged.has(item.key)}
          onTree={onTree.has(item.key)}
          onToggle={() => toggleStaged(item.key)}
          onHover={(key) => (shownVariant.key = key)}
        />
      {/snippet}
      {#snippet empty()}
        <p class="text-muted-foreground p-4 text-xs">
          {sequence.length > 0
            ? "No variant runs through that sequence."
            : "No variants in this log."}
        </p>
      {/snippet}
    </VirtualList>
  {/if}

  <div class="flex shrink-0 items-center gap-2 border-t pt-2">
    <Button
      size="sm"
      class="flex-1"
      disabled={!dirty || staged.size === 0}
      title={staged.size === 0 ? "Stage at least one variant" : undefined}
      onclick={() => applyStaged(project)}
    >
      {#if dirty}
        Apply · {formatNumber(applied)} → {formatNumber(staged.size)} variants
      {:else}
        Apply
      {/if}
    </Button>
    <Button size="sm" variant="ghost" disabled={!dirty} onclick={resetStaged}>Reset</Button>
  </div>
  {#if dirty}
    <p class="text-muted-foreground shrink-0 text-[0.625rem]">
      Nothing changes on the canvas until Apply, and the tree is rebuilt.
    </p>
  {/if}
</div>

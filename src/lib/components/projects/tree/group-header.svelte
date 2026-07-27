<script lang="ts">
  /**
   * Per-Group context above the canvas: case counts, case-level attributes and
   * their Significance Tests. Different data from the tree — it belongs to the
   * Groups, not to any node — so it gets its own strip rather than the panel.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import SummaryCompare from "$lib/components/projects/tree/summary-compare.svelte";
  import { formatNumber } from "$lib/format";
  import type { DirectedTree } from "$lib/tree";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let { tree, names }: { tree: DirectedTree; names: [string, string | null] } = $props();

  const caseLevel = $derived(Object.keys(tree.groupA.caseLevel));
</script>

<div class="border-border bg-background flex flex-col gap-3 border-b px-4 py-3">
  <div class="flex flex-wrap items-center gap-4">
    <div class="flex items-center gap-2">
      <span class="size-2 rounded-full" style="background:var(--slice-1)" aria-hidden="true"></span>
      <span class="text-xs font-semibold">{names[0]}</span>
      <span class="text-muted-foreground font-mono text-[0.6875rem]">
        {formatNumber(tree.groupA.caseCount)} cases
      </span>
    </div>
    {#if tree.groupB && names[1]}
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full" style="background:var(--slice-2)" aria-hidden="true"
        ></span>
        <span class="text-xs font-semibold">{names[1]}</span>
        <span class="text-muted-foreground font-mono text-[0.6875rem]">
          {formatNumber(tree.groupB.caseCount)} cases
        </span>
      </div>
    {:else}
      <Badge variant="secondary">One group — no comparison</Badge>
    {/if}

    <div class="text-muted-foreground ml-auto font-mono text-[0.6875rem]">
      {formatNumber(tree.variantsIncluded)} of {formatNumber(tree.variantsTotal)} variants ·
      {Math.round(tree.caseCoverage * 100)}% of cases
    </div>
  </div>

  {#if tree.overlapCases > 0}
    <Alert.Root variant="destructive">
      <TriangleAlert />
      <Alert.Title>
        {formatNumber(tree.overlapCases)} cases are in both groups
      </Alert.Title>
      <Alert.Description>
        Both Significance Tests assume the two groups are independent samples. Overlapping cases
        make every p-value on screen optimistic.
      </Alert.Description>
    </Alert.Root>
  {/if}

  {#if tree.cappedByCeiling}
    <p class="text-muted-foreground text-[0.6875rem]">
      Variant ceiling reached before the coverage target — lower the coverage to see a cleaner
      tree.
    </p>
  {/if}

  {#if caseLevel.length > 0}
    <div class="grid gap-3 md:grid-cols-2">
      {#each caseLevel as name (name)}
        {@const test = tree.caseLevelTests[name]}
        <div class="border-border flex flex-col gap-1.5 border p-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold">{name}</span>
            {#if test?.significant}
              <Badge>significant</Badge>
            {/if}
          </div>
          <SummaryCompare
            groupA={tree.groupA.caseLevel[name] ?? null}
            groupB={tree.groupB?.caseLevel[name] ?? null}
          />
          {#if test}
            <p class="text-muted-foreground font-mono text-[0.625rem]">
              p = {test.pValue < 0.001 ? test.pValue.toExponential(1) : test.pValue.toFixed(3)} ·
              effect {test.effectSize.toFixed(2)}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

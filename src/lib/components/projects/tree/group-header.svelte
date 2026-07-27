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

  let { tree }: { tree: DirectedTree } = $props();

  const caseLevel = $derived(Object.keys(tree.groupA.caseLevel));
  // Group names and case counts live on the filter summary bar, which already
  // names every slice — this strip only carries what that bar cannot say.
  const hasContent = $derived(
    tree.overlapCases > 0 || tree.cappedByCeiling || caseLevel.length > 0 || !tree.groupB
  );
</script>

{#if hasContent}
  <div class="border-border bg-background flex flex-col gap-3 border-b px-4 py-3">
    {#if !tree.groupB}
      <Badge variant="secondary" class="self-start">One group — no comparison</Badge>
    {/if}

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
{/if}

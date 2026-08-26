<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import EffectChip from "$lib/tree/components/effect-chip.svelte";
  import SummaryCompare from "$lib/tree/components/summary-compare.svelte";
  import { formatNumber } from "$lib/format";
  import type { ResponseDirectedTree } from "$lib/tree/invokers/types";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let { tree }: { tree: ResponseDirectedTree } = $props();

  const caseLevel = $derived(Object.keys(tree.groups[0]?.caseLevel ?? {}));
  const comparing = $derived(tree.groups.length > 1);
  const hasContent = $derived(
    tree.overlapCases > 0 || tree.cappedByCeiling || caseLevel.length > 0 || !comparing
  );
</script>

{#if hasContent}
  <div class="border-border bg-background flex flex-col gap-3 border-b px-4 py-3">
    {#if !comparing}
      <Badge variant="secondary" class="self-start">One group, no comparison</Badge>
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
        The log has more Variants than a build ships. The rarest ones are not in this tree at all,
        whatever the slider says.
      </p>
    {/if}

    {#if caseLevel.length > 0}
      <div class="grid gap-3 md:grid-cols-2">
        {#each caseLevel as name (name)}
          <div class="border-border flex flex-col gap-1.5 border p-2.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-semibold">{name}</span>
              <EffectChip test={tree.caseLevelTests[name]} />
            </div>
            <SummaryCompare
              summaries={Object.fromEntries(
                tree.groups.map((group) => [group.id, group.caseLevel[name] ?? null])
              )}
              compare={comparing}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

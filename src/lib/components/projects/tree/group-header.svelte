<script lang="ts">
  /**
   * Per-Group context above the canvas: case counts, case-level attributes and
   * their Significance Tests. Different data from the tree — it belongs to the
   * Groups, not to any node — so it gets its own strip rather than the panel.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import EffectChip from "$lib/components/projects/tree/effect-chip.svelte";
  import SummaryCompare from "$lib/components/projects/tree/summary-compare.svelte";
  import { formatNumber } from "$lib/format";
  import { groupLabels, treeMode } from "$lib/state/tree.svelte";
  import type { DirectedTree } from "$lib/tree";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  let { tree }: { tree: DirectedTree } = $props();

  // Read off the tree on screen, not off the slices as they stand: deleting a
  // slice leaves this two-Group drawing up until the user rebuilds, and a badge
  // announcing base mode over it would contradict what is drawn.
  const mode = $derived(treeMode(tree));
  const labels = $derived(groupLabels(tree));
  /**
   * Why there is nothing to compare, not just that there isn't: base mode has
   * one population by construction, so no Significance Test can run at all.
   * One-Group mode says nothing here — the strip's own single column, and the
   * slice named on the filter summary bar, already say there is one group.
   */
  const scope = $derived(
    mode === "base" ? `${labels.a.name} — case counts only, no significance tests` : null
  );

  const caseLevel = $derived(Object.keys(tree.groupA.caseLevel));
  // Group names and case counts live on the filter summary bar, which already
  // names every slice — this strip only carries what that bar cannot say.
  const hasContent = $derived(
    tree.overlapCases > 0 || tree.cappedByCeiling || caseLevel.length > 0 || scope !== null
  );
</script>

{#if hasContent}
  <div class="border-border bg-background flex flex-col gap-3 border-b px-4 py-3">
    {#if scope}
      <Badge variant="secondary" class="self-start">{scope}</Badge>
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
        The log has more Variants than a build ships — the rarest ones are not in this tree at
        all, whatever the slider says.
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
              groupA={tree.groupA.caseLevel[name] ?? null}
              groupB={tree.groupB?.caseLevel[name] ?? null}
              compare={tree.groupB !== null}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

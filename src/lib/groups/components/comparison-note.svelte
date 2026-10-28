<script lang="ts">
  /**
   * The always-visible line saying what the comparison removed, with a chip on
   * each reduced side that opens the cases it lost. Nothing when it removed nothing.
   */
  import { Button } from "$lib/components/ui/button/index.js";
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import DataDrawer from "$lib/groups/components/data-drawer.svelte";
  import { comparedGroups, relation } from "$lib/groups/state/comparison.svelte";
  import type { Group } from "$lib/groups/types";
  import {
    comparisonSentence,
    reducedSides,
    removedChip,
    removedCopy,
    removedFilters,
    type ReducedSide
  } from "$lib/groups/utils/comparison-note";
  import { colorVar, formatNumber } from "$lib/format";
  import { cn } from "$lib/utils";
  import Table2 from "@lucide/svelte/icons/table-2";

  let { project, class: className }: { project: Project; class?: string } = $props();

  const groups = $derived(comparedGroups());
  const sentence = $derived(comparisonSentence(groups, relation.summary));
  const sides = $derived(reducedSides(groups, relation.summary));

  let cardOpen = $state<Record<string, boolean>>({});
  let drawerOpen = $state(false);
  let narrowed = $state<{ group: Group; filters: Filter[]; label: string } | null>(null);

  function viewRemoved(side: ReducedSide) {
    cardOpen[side.group.id] = false;
    narrowed = {
      group: side.group,
      filters: removedFilters(side),
      label: `${formatNumber(side.removed)} removed cases, also in ${side.other.name}`
    };
    drawerOpen = true;
  }
</script>

{#if sentence}
  <div class={cn("flex min-w-0 items-center gap-2", className)}>
    <p class="text-muted-foreground min-w-0 truncate text-xs" title={sentence}>
      {sentence}
    </p>
    {#each sides as side (side.group.id)}
      <HoverCard.Root
        openDelay={200}
        open={cardOpen[side.group.id] ?? false}
        onOpenChange={(open) => (cardOpen[side.group.id] = open)}
      >
        <HoverCard.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="bg-muted text-foreground hover:bg-accent inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 px-1.5 font-mono text-[0.6875rem]"
              aria-label="{formatNumber(side.removed)} cases removed from {side.group.name}"
              onclick={() => (cardOpen[side.group.id] = true)}
            >
              <span
                class="size-2 shrink-0"
                style="background:{colorVar(side.group.color)}"
                aria-hidden="true"
              ></span>
              {removedChip(side)}
            </button>
          {/snippet}
        </HoverCard.Trigger>
        <HoverCard.Content class="flex w-72 flex-col gap-2.5" align="start">
          <p class="text-pretty">
            {relation.summary ? removedCopy(side, relation.summary) : ""}
          </p>
          <Button variant="outline" size="sm" class="self-start" onclick={() => viewRemoved(side)}>
            <Table2 data-icon="inline-start" />
            View removed cases
          </Button>
        </HoverCard.Content>
      </HoverCard.Root>
    {/each}
  </div>
{/if}

<DataDrawer bind:open={drawerOpen} {project} {groups} {narrowed} />

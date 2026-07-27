<script lang="ts">
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { baseSlice, namedSlices, sliceColor } from "$lib/state/slices.svelte";
  import { describeFilter } from "$lib/filters";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project, Slice } from "$lib/types";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let { project }: { project: Project } = $props();
  const projectId = $derived(project.id);

  // Case counts come from the stats cache and stay blank until a view has
  // computed them, so the bar never triggers analysis of its own.
  const entries = $derived(
    [baseSlice(), ...namedSlices()].filter((slice): slice is Slice => slice !== null)
  );
</script>

<div class="border-border bg-sidebar flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
  {#if entries.length === 0}
    <p class="text-muted-foreground flex items-center gap-2 text-xs">
      <SlidersHorizontal class="size-3.5" aria-hidden="true" />
      No filters — every view shows the whole event log.
    </p>
  {:else}
    {#each entries as slice, index (slice.id)}
      {#if index > 0}
        <!-- Explicit height: a vertical separator has none of its own in a
             flex row that only stretches to its content. -->
        <Separator orientation="vertical" class="h-4" />
      {/if}
      <HoverCard.Root openDelay={120}>
        <HoverCard.Trigger
          href="/app/projects/{projectId}/filters"
          class="hover:bg-muted focus-visible:ring-ring flex items-center gap-1.5 px-2 py-1 whitespace-nowrap focus-visible:ring-1 focus-visible:outline-none"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            style="background:{colorVar(sliceColor(slice))}"
            aria-hidden="true"
          ></span>
          <span class="text-xs font-semibold">{slice.name}</span>
          <Badge variant="secondary">{slice.filters.length}</Badge>
          {#if slice.stats}
            <span class="text-muted-foreground font-mono text-[0.6875rem]">
              {formatNumber(slice.stats.cases)} cases
              {#if project.cases > 0}
                ({Math.round((slice.stats.cases / project.cases) * 100)}%)
              {/if}
            </span>
          {/if}
        </HoverCard.Trigger>
        <HoverCard.Content class="w-80">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5">
              <span
                class="size-2 shrink-0 rounded-full"
                style="background:{colorVar(sliceColor(slice))}"
                aria-hidden="true"
              ></span>
              <span class="text-sm font-semibold">{slice.name}</span>
            </div>
            <Separator />
            <!-- The slice's own filters only. Base's are listed on Base's own
                 chip, so repeating them here was noise on every slice. -->
            {#if slice.filters.length === 0}
              <p class="text-muted-foreground text-xs">
                No filters — this population is the
                {slice.kind === "base" ? "whole event log" : "base population"}.
              </p>
            {:else}
              <ol class="flex flex-col gap-2">
                {#each slice.filters as filter, index (index)}
                  {@const described = describeFilter(filter)}
                  <li class="flex items-start gap-2">
                    <span class="text-muted-foreground w-4 shrink-0 font-mono text-xs">
                      {index + 1}
                    </span>
                    <div class="min-w-0">
                      <p class="text-xs font-medium">{described.title}</p>
                      <p class="text-muted-foreground truncate font-mono text-[0.6875rem]">
                        {described.detail}
                      </p>
                    </div>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        </HoverCard.Content>
      </HoverCard.Root>
    {/each}
  {/if}
</div>

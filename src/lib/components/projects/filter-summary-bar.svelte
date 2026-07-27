<script lang="ts">
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import { baseSlice, effectiveChain, namedSlices } from "$lib/state/slices.svelte";
  import { describeFilter } from "$lib/filters";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Slice } from "$lib/types";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let { projectId }: { projectId: string } = $props();

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
    {#each entries as slice (slice.id)}
      <HoverCard.Root openDelay={120}>
        <HoverCard.Trigger
          href="/app/projects/{projectId}/filters"
          class="hover:bg-muted focus-visible:ring-ring flex items-center gap-1.5 px-2 py-1 whitespace-nowrap focus-visible:ring-1 focus-visible:outline-none"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            style="background:{colorVar(slice.color)}"
            aria-hidden="true"
          ></span>
          <span class="text-xs font-semibold">{slice.name}</span>
          <Badge variant="secondary">{slice.filters.length}</Badge>
          {#if slice.stats}
            <span class="text-muted-foreground font-mono text-[0.6875rem]">
              {formatNumber(slice.stats.cases)} cases
            </span>
          {/if}
        </HoverCard.Trigger>
        <HoverCard.Content class="w-80">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5">
              <span
                class="size-2 shrink-0 rounded-full"
                style="background:{colorVar(slice.color)}"
                aria-hidden="true"
              ></span>
              <span class="text-sm font-semibold">{slice.name}</span>
              <span class="text-muted-foreground ml-auto text-xs">
                {slice.kind === "base" ? "applies to every slice" : "chains on top of Base"}
              </span>
            </div>
            <Separator />
            {#if effectiveChain(slice).length === 0}
              <p class="text-muted-foreground text-xs">
                No filters — this population is the
                {slice.kind === "base" ? "whole event log" : "base population"}.
              </p>
            {:else}
              <ol class="flex flex-col gap-2">
                {#each effectiveChain(slice) as filter, index (index)}
                  {@const described = describeFilter(filter)}
                  {@const inherited = index < effectiveChain(slice).length - slice.filters.length}
                  <li class="flex items-start gap-2">
                    <span class="text-muted-foreground w-4 shrink-0 font-mono text-xs">
                      {index + 1}
                    </span>
                    <div class="min-w-0">
                      <p class="text-xs font-medium">
                        {described.title}
                        {#if inherited}
                          <span class="text-muted-foreground font-normal">· from Base</span>
                        {/if}
                      </p>
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

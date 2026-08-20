<script lang="ts">
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    baseSlice,
    chainKey,
    effectiveChain,
    loadSharedCases,
    namedSlices,
    sharedCases,
    sliceCases,
    sliceColor,
    sliceEvents
  } from "$lib/slices/state/slices.svelte";
  import { describeFilter } from "$lib/filters/filters/filter";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import type { Slice } from "$lib/slices/types";
  import type { Snippet } from "svelte";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  /**
   * `trailing` is for whatever the current view wants to say about the same
   * populations — the tree's variant coverage, for instance.
   */
  let { project, trailing, actions }: { project: Project; trailing?: Snippet; actions?: Snippet } =
    $props();
  const projectId = $derived(project.id);

  const entries = $derived(
    [baseSlice(), ...namedSlices()].filter((slice): slice is Slice => slice !== null)
  );

  /** Both groups, only once there are two — nothing to share with one. */
  const groupA = $derived(namedSlices()[0] ?? null);
  const groupB = $derived(namedSlices()[1] ?? null);

  $effect(() => {
    if (groupA && groupB) loadSharedCases(project, groupA, groupB);
  });

  /**
   * A size of the chain as it stands right now: the Filters view's live
   * measurement when it has one, otherwise the stats cache — but only when its
   * key still matches, or an edit would leave the old count on screen.
   */
  function current(slice: Slice, metric: "cases" | "events"): number | null {
    const measured = metric === "cases" ? sliceCases(slice) : sliceEvents(slice);
    if (measured !== null) return measured;
    return slice.statsKey === chainKey(effectiveChain(slice))
      ? (slice.stats?.[metric] ?? null)
      : null;
  }

  /** `12,345 cases (48%)` — the share omitted when there is no total to divide by. */
  function size(value: number, total: number, unit: string): string {
    const share = total > 0 ? ` (${Math.round((value / total) * 100)}%)` : "";
    return `${formatNumber(value)} ${unit}${share}`;
  }
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
        <!-- self-stretch: a vertical separator has no height of its own in a
             flex row that only stretches to its content, so it stops short
             of the bar's own top and bottom without this. -->
        <Separator orientation="vertical" class="self-stretch" />
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
          {@const cases = current(slice, "cases")}
          {@const events = current(slice, "events")}
          {#if cases !== null}
            <span class="text-muted-foreground font-mono text-[0.6875rem]">
              {size(cases, project.cases, "cases")}
              {#if events !== null}
                · {size(events, project.events, "events")}
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
    {#if groupA && groupB}
      {@const shared = sharedCases(groupA, groupB)}
      <Separator orientation="vertical" class="self-stretch" />
      <span
        class="text-muted-foreground flex items-center gap-1.5 px-2 py-1 text-xs whitespace-nowrap"
      >
        <span class="relative flex size-3 shrink-0 items-center" aria-hidden="true">
          <span class="border-muted-foreground absolute left-0 size-2.5 rounded-full border"></span>
          <span class="border-muted-foreground absolute left-1 size-2.5 rounded-full border"></span>
        </span>
        {shared === null
          ? ""
          : shared > 0
            ? `${formatNumber(shared)} cases shared`
            : "No cases shared"}
      </span>
    {/if}
  {/if}
  <div class="ml-auto flex items-center gap-3">
    {#if trailing}
      <span class="text-muted-foreground font-mono text-[0.6875rem]">{@render trailing()}</span>
    {/if}
    {#if actions}
      {@render actions()}
    {/if}
  </div>
</div>

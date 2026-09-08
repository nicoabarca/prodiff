<script lang="ts">
  import * as HoverCard from "$lib/components/ui/hover-card/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    groupCases,
    groupEvents,
    groups,
    loadSharedCases,
    sharedCases
  } from "$lib/groups/state/groups.svelte";
  import { describeFilter } from "$lib/filters/kind/filter";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import type { Group } from "$lib/groups/types";
  import type { Snippet } from "svelte";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  /** `trailing` is whatever the current view wants to say about the same Groups. */
  let { project, trailing, actions }: { project: Project; trailing?: Snippet; actions?: Snippet } =
    $props();
  const projectId = $derived(project.id);

  /** The bar is one row tall at any Group count, so only the first two are shown inline. */
  const INLINE = 2;

  const entries = $derived(groups);
  const inline = $derived(entries.slice(0, INLINE));
  const overflow = $derived(entries.slice(INLINE));

  /** The Groups the overlap is measured across, only once there are two. */
  const overlapping = $derived(groups.length > 1 ? groups.slice(0, 2) : null);

  $effect(() => {
    if (overlapping) loadSharedCases(project, overlapping);
  });

  /** A Group's size now: the live measurement when there is one, otherwise what Apply stored. */
  function current(group: Group, metric: "cases" | "events"): number | null {
    const measured = metric === "cases" ? groupCases(group) : groupEvents(group);
    return measured ?? group.stats?.[metric] ?? null;
  }

  /** `12,345 cases (48%)`, the share omitted with no total to divide by. */
  function size(value: number, total: number, unit: string): string {
    const share = total > 0 ? ` (${Math.round((value / total) * 100)}%)` : "";
    return `${formatNumber(value)} ${unit}${share}`;
  }
</script>

{#snippet dot(group: Group)}
  <span
    class="size-2 shrink-0 rounded-full"
    style="background:{colorVar(group.color)}"
    aria-hidden="true"
  ></span>
{/snippet}

{#snippet figures(group: Group)}
  {@const cases = current(group, "cases")}
  {@const events = current(group, "events")}
  {#if cases !== null}
    <span class="text-muted-foreground font-mono text-[0.6875rem] whitespace-nowrap">
      {size(cases, project.cases, "cases")}
      {#if events !== null}
        · {size(events, project.events, "events")}
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet details(group: Group)}
  <div class="flex flex-col gap-2">
    <ol class="flex flex-col gap-2">
      {#each group.filters as filter, index (index)}
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
  </div>
{/snippet}

<div
  class="border-border bg-sidebar flex h-10 shrink-0 items-center gap-1 overflow-hidden border-b px-3"
>
  {#if entries.length === 0}
    <p class="text-muted-foreground flex items-center gap-2 text-xs">
      <SlidersHorizontal class="size-3.5" aria-hidden="true" />
      No groups yet. Every view shows the whole event log.
    </p>
  {:else}
    {#each inline as group, index (group.id)}
      {#if index > 0}
        <Separator orientation="vertical" class="h-5 self-center" />
      {/if}
      <HoverCard.Root openDelay={120}>
        <HoverCard.Trigger
          href="/app/projects/{projectId}/filters"
          class="hover:bg-muted focus-visible:ring-ring flex min-w-0 items-center gap-1.5 px-2 py-1 whitespace-nowrap focus-visible:ring-1 focus-visible:outline-none"
        >
          {@render dot(group)}
          <span class="truncate text-xs font-semibold">{group.name}</span>
          <Badge variant="secondary">{group.filters.length}</Badge>
          {@render figures(group)}
        </HoverCard.Trigger>
        <HoverCard.Content class="w-80">
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-1.5">
              {@render dot(group)}
              <span class="text-sm font-semibold">{group.name}</span>
            </div>
            <Separator />
            {@render details(group)}
          </div>
        </HoverCard.Content>
      </HoverCard.Root>
    {/each}
    {#if overflow.length > 0}
      <Separator orientation="vertical" class="h-5 self-center" />
      <Popover.Root>
        <Popover.Trigger
          class="hover:bg-muted focus-visible:ring-ring text-muted-foreground shrink-0 px-2 py-1 text-xs font-medium whitespace-nowrap focus-visible:ring-1 focus-visible:outline-none"
        >
          +{overflow.length} more
        </Popover.Trigger>
        <Popover.Content class="max-h-96 w-80 overflow-auto">
          <div class="flex flex-col gap-4">
            {#each overflow as group (group.id)}
              <div class="flex flex-col gap-2">
                <a
                  href="/app/projects/{projectId}/filters"
                  class="hover:bg-muted focus-visible:ring-ring -mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 focus-visible:ring-1 focus-visible:outline-none"
                >
                  {@render dot(group)}
                  <span class="truncate text-xs font-semibold">{group.name}</span>
                  <Badge variant="secondary">{group.filters.length}</Badge>
                </a>
                {@render figures(group)}
                <Separator />
                {@render details(group)}
              </div>
            {/each}
          </div>
        </Popover.Content>
      </Popover.Root>
    {/if}
    {#if overlapping}
      {@const shared = sharedCases(overlapping)}
      <Separator orientation="vertical" class="h-5 self-center" />
      <span
        class="text-muted-foreground flex shrink-0 items-center gap-1.5 px-2 py-1 text-xs whitespace-nowrap"
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
  <div class="ml-auto flex shrink-0 items-center gap-3">
    {#if trailing}
      <span class="text-muted-foreground font-mono text-[0.6875rem]">{@render trailing()}</span>
    {/if}
    {#if actions}
      {@render actions()}
    {/if}
  </div>
</div>

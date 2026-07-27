<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    chainImpact,
    effectiveChain,
    renameSlice,
    type ChainStep
  } from "$lib/state/slices.svelte";
  import { describeFilter } from "$lib/filters";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project, Slice } from "$lib/types";
  import Plus from "@lucide/svelte/icons/plus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let {
    project,
    slice,
    editingIndex = null,
    onedit,
    onremovefilter,
    onremoveslice
  }: {
    project: Project;
    slice: Slice;
    /** Which of this slice's filters the editor is on, if any. */
    editingIndex?: number | null;
    onedit: (slice: Slice, index: number | null) => void;
    onremovefilter: (slice: Slice, index: number) => void;
    onremoveslice?: (slice: Slice) => void;
  } = $props();

  const chain = $derived(effectiveChain(slice));
  /** Filters inherited from Base sit in front of this slice's own. */
  const inherited = $derived(chain.length - slice.filters.length);

  let steps = $state<ChainStep[] | null>(null);

  $effect(() => {
    const current = chain;
    let stale = false;
    steps = null;
    chainImpact(project, current)
      .then((result) => {
        if (!stale) steps = result;
      })
      .catch(() => {
        if (!stale) steps = null;
      });
    return () => {
      stale = true;
    };
  });

  /** Cases before and after the filter at this slice-local index. */
  function impact(index: number): { before: ChainStep; after: ChainStep } | null {
    if (!steps) return null;
    const global = inherited + index;
    if (global + 1 >= steps.length) return null;
    return { before: steps[global], after: steps[global + 1] };
  }

  function retained(index: number): number | null {
    const measured = impact(index);
    if (!measured || measured.before.cases === 0) return null;
    return Math.round((measured.after.cases / measured.before.cases) * 100);
  }

  let renaming = $state(false);
  let draftName = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);

  function startRename() {
    draftName = slice.name;
    renaming = true;
  }

  async function commitRename() {
    if (!renaming) return;
    renaming = false;
    await renameSlice(slice, draftName);
  }

  $effect(() => {
    if (renaming) nameInput?.select();
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>
      <span class="flex items-center gap-2">
        <span
          class="size-2.5 shrink-0 rounded-full"
          style="background:{colorVar(slice.color)}"
          aria-hidden="true"
        ></span>
        {#if slice.kind === "base"}
          {slice.name}
        {:else if renaming}
          <Input
            bind:ref={nameInput}
            bind:value={draftName}
            onblur={commitRename}
            onkeydown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") renaming = false;
            }}
            aria-label="Slice name"
            class="h-7 w-48"
          />
        {:else}
          <button
            type="button"
            onclick={startRename}
            class="hover:bg-muted focus-visible:ring-ring -mx-1 px-1 text-left focus-visible:ring-1 focus-visible:outline-none"
            title="Rename slice"
          >
            {slice.name}
          </button>
        {/if}
      </span>
    </Card.Title>
    <Card.Description>
      {#if slice.kind === "base"}
        Applies to every slice before its own filters run.
      {:else if inherited > 0}
        Runs after Base's {inherited}
        {inherited === 1 ? "filter" : "filters"}.
      {:else}
        Runs on the whole event log.
      {/if}
    </Card.Description>
    <Card.Action>
      <div class="flex gap-1">
        <Button variant="outline" size="sm" onclick={() => onedit(slice, null)}>
          <Plus data-icon="inline-start" />
          Add filter
        </Button>
        {#if slice.kind === "slice" && onremoveslice}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-sm"
                  onclick={() => onremoveslice(slice)}
                  aria-label="Delete slice"
                >
                  <Trash2 />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Delete slice</Tooltip.Content>
          </Tooltip.Root>
        {/if}
      </div>
    </Card.Action>
  </Card.Header>

  <Card.Content class="px-0">
    {#if slice.filters.length === 0}
      <Empty.Root class="py-6">
        <Empty.Header>
          <Empty.Media variant="icon">
            <SlidersHorizontal />
          </Empty.Media>
          <Empty.Description>
            No filters — this population is the
            {slice.kind === "base" ? "whole event log" : "base population"}.
          </Empty.Description>
        </Empty.Header>
      </Empty.Root>
    {:else}
      <ol class="flex flex-col">
        {#each slice.filters as filter, index (index)}
          {@const described = describeFilter(filter)}
          {@const measured = impact(index)}
          {@const pct = retained(index)}
          <li
            class="border-border flex items-center gap-3 border-t px-6 py-3 {editingIndex === index
              ? 'bg-muted'
              : ''}"
          >
            <span class="text-muted-foreground w-4 shrink-0 font-mono text-xs">
              {inherited + index + 1}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{described.title}</p>
              <p class="text-muted-foreground truncate font-mono text-xs">{described.detail}</p>
            </div>

            <div class="w-40 shrink-0">
              {#if measured && pct !== null}
                <div class="flex items-center gap-2">
                  <Progress value={pct} class="h-1.5" />
                  <span class="text-muted-foreground w-9 shrink-0 text-right font-mono text-xs">
                    {pct}%
                  </span>
                </div>
                <p class="text-muted-foreground mt-1 text-right font-mono text-[0.6875rem]">
                  {formatNumber(measured.after.cases)} / {formatNumber(measured.before.cases)} cases
                </p>
              {:else}
                <Skeleton class="h-4 w-full" />
              {/if}
            </div>

            <div class="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onclick={() => onedit(slice, index)}
                aria-label="Edit filter"
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onclick={() => onremovefilter(slice, index)}
                aria-label="Remove filter"
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </Card.Content>

  {#if steps && steps.length > 0}
    <Card.Footer class="text-muted-foreground justify-between text-xs">
      <span>Population after applying filters</span>
      <span class="text-foreground font-mono">
        <Badge variant="secondary">
          {formatNumber(steps[steps.length - 1].cases)} cases
        </Badge>
      </span>
    </Card.Footer>
  {/if}
</Card.Root>

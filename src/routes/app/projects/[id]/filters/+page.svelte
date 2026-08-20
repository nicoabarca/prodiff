<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { currentProject } from "$lib/event-log/state/projects.svelte";
  import {
    MAX_SLICES,
    baseSlice,
    canCreateSlice,
    createSlice,
    effectiveChain,
    ensureBase,
    namedSlices,
    removeSlice,
    setFilters,
    sliceColor
  } from "$lib/state/slices.svelte";
  import { colorVar } from "$lib/format";
  import type { Filter } from "$lib/filters";
  import FilterEditor from "$lib/components/projects/filter-editor.svelte";
  import SliceCard from "$lib/components/projects/slice-card.svelte";
  import SliceComparison from "$lib/components/projects/slice-comparison.svelte";
  import type { Slice } from "$lib/types";
  import Plus from "@lucide/svelte/icons/plus";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  const project = $derived(currentProject());
  const base = $derived(baseSlice());
  const cards = $derived([base, ...namedSlices()].filter((s): s is Slice => s !== null));

  /** Which slice the editor is on, and which of its filters (null = new). */
  let editing = $state<{ sliceId: string; index: number | null } | null>(null);

  const editingSlice = $derived(cards.find((s) => s.id === editing?.sliceId) ?? null);
  const editingFilter = $derived(
    editingSlice && editing?.index !== null && editing !== null
      ? (editingSlice.filters[editing.index] ?? null)
      : null
  );

  /**
   * Filters that run before the one being edited — Base's chain, then this
   * slice's own filters up to that point. The editor measures its draft against
   * exactly this, so the impact it shows is the one the filter will have.
   */
  const precedingChain = $derived.by(() => {
    if (!editingSlice || !editing) return [];
    const inherited = effectiveChain(editingSlice).length - editingSlice.filters.length;
    const own = editingSlice.filters.slice(
      0,
      editing.index === null ? editingSlice.filters.length : editing.index
    );
    return [...effectiveChain(editingSlice).slice(0, inherited), ...own];
  });

  function openEditor(slice: Slice, index: number | null) {
    editing = { sliceId: slice.id, index };
  }

  async function saveFilter(filter: Filter) {
    if (!editingSlice || !editing) return;
    const next = [...editingSlice.filters];
    if (editing.index === null) next.push(filter);
    else next[editing.index] = filter;
    await setFilters(editingSlice, next);
    editing = null;
  }

  async function removeFilter(slice: Slice, index: number) {
    if (editing?.sliceId === slice.id && editing.index === index) editing = null;
    await setFilters(
      slice,
      slice.filters.filter((_, i) => i !== index)
    );
  }

  async function deleteSlice(slice: Slice) {
    if (editing?.sliceId === slice.id) editing = null;
    await removeSlice(slice.id);
  }
</script>

{#if project}
  <!-- Wide enough for the two columns, the page stops scrolling as a whole and
       each column takes the height the view has left, keeping the `p-5` gap
       under the topbar. Narrow, the columns stack and the page scrolls again. -->
  <main class="bg-sidebar min-h-0 flex-1 overflow-auto p-5 lg:overflow-hidden">
    <div class="grid w-full grid-cols-1 items-start gap-5 lg:h-full lg:grid-cols-2">
      <!-- Filters: half the width -->
      <!-- A card's outline is a `ring`, which is painted outside its box and so
           is clipped away on the left and right by this column's own scrolling.
           One pixel of padding is exactly the room it needs. -->
      <div class="flex flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-auto lg:px-px">
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h1 class="text-sm font-semibold">Filters</h1>
            <p class="text-muted-foreground text-xs">
              The base chain applies to every view. Each slice adds its own filters on top of it, in
              order.
            </p>
          </div>
          {#if cards.length === 0}
            <Button
              variant="outline"
              size="sm"
              class="ml-auto"
              onclick={() => ensureBase(project.id)}
            >
              <Plus data-icon="inline-start" />
              Add base filters
            </Button>
          {/if}
        </div>

        {#if cards.length === 0}
          <Empty.Root class="border-border bg-background border">
            <Empty.Header>
              <Empty.Media variant="icon">
                <SlidersHorizontal />
              </Empty.Media>
              <Empty.Title>No filters yet</Empty.Title>
              <Empty.Description>
                Start with a base chain that every view inherits, then add up to {MAX_SLICES} slices to
                compare against each other.
              </Empty.Description>
            </Empty.Header>
            <Empty.Content>
              <Button onclick={() => ensureBase(project.id)}>
                <Plus data-icon="inline-start" />
                Add base filters
              </Button>
            </Empty.Content>
          </Empty.Root>
        {:else}
          <SliceComparison slices={namedSlices()} />
          {#each cards as slice (slice.id)}
            <SliceCard
              {project}
              {slice}
              editingIndex={editing?.sliceId === slice.id ? editing.index : null}
              onedit={openEditor}
              onremovefilter={removeFilter}
              onremoveslice={deleteSlice}
            />
          {/each}

          <div class="flex flex-wrap items-center justify-end gap-3">
            <p class="text-muted-foreground text-xs">
              You can create up to {MAX_SLICES} slices.
              {#if !canCreateSlice()}
                Delete one to add another.
              {/if}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={!canCreateSlice()}
              onclick={() => createSlice(project.id)}
            >
              <Plus data-icon="inline-start" />
              New slice
            </Button>
          </div>
        {/if}
      </div>

      <!-- Configuration: the other half, the full height of the view -->
      <div class="lg:h-full lg:min-h-0">
        <Card.Root class="lg:h-full">
          <Card.Header>
            <Card.Title>
              {editing === null
                ? "Configure filter"
                : editing.index === null
                  ? "Add filter"
                  : "Edit filter"}
            </Card.Title>
            <Card.Description>
              {#if editingSlice}
                In <span class="text-foreground font-medium">{editingSlice.name}</span> — filters apply
                in order, each to the previous one's result.
              {:else}
                Pick “Add filter” on a slice to configure one here.
              {/if}
            </Card.Description>
          </Card.Header>
          <!-- The editor is the tall thing on this page (the duration chart in
               particular), so it scrolls inside the card rather than pushing
               the card past the bottom of the view. -->
          <Card.Content class="lg:min-h-0 lg:flex-1 lg:overflow-auto">
            {#if editingSlice && editing}
              {#key `${editing.sliceId}:${editing.index}`}
                <FilterEditor
                  {project}
                  filter={editingFilter}
                  {precedingChain}
                  color={colorVar(sliceColor(editingSlice))}
                  onsave={saveFilter}
                  oncancel={() => (editing = null)}
                />
              {/key}
            {:else}
              <Empty.Root class="py-8">
                <Empty.Header>
                  <Empty.Media variant="icon">
                    <SlidersHorizontal />
                  </Empty.Media>
                  <Empty.Description>
                    No filter selected. Add one to a slice, or click a filter to edit it.
                  </Empty.Description>
                </Empty.Header>
              </Empty.Root>
            {/if}
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  </main>
{/if}

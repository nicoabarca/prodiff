<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { loadImpact, renameGroup, groupSteps } from "$lib/groups/state/groups.svelte";
  import {
    discardDraft,
    draftOf,
    isDirty,
    moveInDraft,
    removeFromDraft
  } from "$lib/groups/state/drafts.svelte";
  import ColorPicker from "$lib/groups/components/color-picker.svelte";
  import type { ResponseFilterStep } from "$lib/groups/invokers/types";
  import { describeGroupFilter } from "$lib/groups/utils/describe";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import type { Group } from "$lib/groups/types";
  import Check from "@lucide/svelte/icons/check";
  import Copy from "@lucide/svelte/icons/copy";
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Plus from "@lucide/svelte/icons/plus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Undo2 from "@lucide/svelte/icons/undo-2";

  let {
    project,
    group,
    editingIndex = null,
    onedit,
    onapply,
    oncopy,
    onremovegroup
  }: {
    project: Project;
    group: Group;
    editingIndex?: number | null;
    onedit: (group: Group, index: number | null) => void;
    onapply: (group: Group) => void;
    oncopy: (group: Group) => void;
    onremovegroup: (group: Group) => void;
  } = $props();

  const accent = $derived(colorVar(group.color));
  const filters = $derived(draftOf(group));
  const dirty = $derived(isDirty(group));

  /** A Group created but never applied has no Parquet, so its filters still need writing. */
  const pending = $derived(dirty || group.stats === null);

  // Measurement lives in the shared cache, so the comparison summary reads the same scan.
  const steps = $derived(groupSteps(group, filters));

  let measureError = $state<string | null>(null);

  $effect(() => {
    measureError = null;
    loadImpact(project, group, filters).catch((cause) => {
      measureError = String(cause);
    });
  });

  /** Cases before and after the filter at this index. */
  function impact(index: number): { before: ResponseFilterStep; after: ResponseFilterStep } | null {
    if (!steps || index + 1 >= steps.length) return null;
    return { before: steps[index], after: steps[index + 1] };
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
    draftName = group.name;
    renaming = true;
  }

  async function commitRename() {
    if (!renaming) return;
    renaming = false;
    await renameGroup(group, draftName);
  }

  $effect(() => {
    if (renaming) nameInput?.select();
  });

  // Reordering is semantic, not cosmetic: a trim changes what the filters after
  // it see, so moving a row is a real edit to the draft.
  let dragging = $state<number | null>(null);

  function drop(target: number) {
    if (dragging === null || dragging === target) return;
    moveInDraft(group, dragging, target);
    dragging = null;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>
      <span class="flex items-center gap-2">
        <ColorPicker {group} />
        {#if renaming}
          <Input
            bind:ref={nameInput}
            bind:value={draftName}
            onblur={commitRename}
            onkeydown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") renaming = false;
            }}
            aria-label="Group name"
            class="h-7 w-48"
          />
        {:else}
          {group.name}
          <button
            type="button"
            onclick={startRename}
            class="text-muted-foreground hover:text-foreground focus-visible:ring-ring shrink-0 focus-visible:ring-1 focus-visible:outline-none"
            title="Rename group"
            aria-label="Rename group"
          >
            <Pencil class="size-3.5" />
          </button>
        {/if}
        {#if dirty}
          <Badge variant="outline">Draft</Badge>
        {:else if group.stats === null}
          <Badge variant="outline">Not applied</Badge>
        {/if}
      </span>
    </Card.Title>
    <Card.Description>
      {#if dirty}
        Unapplied edits. The numbers below are this draft's, not the group's.
      {:else}
        {filters.length}
        {filters.length === 1 ? "filter" : "filters"}, applied in order.
      {/if}
    </Card.Description>
    <Card.Action>
      <div class="flex gap-1">
        <Button variant="outline" size="sm" onclick={() => onedit(group, null)}>
          <Plus data-icon="inline-start" />
          Add filter
        </Button>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon-sm"
                onclick={() => oncopy(group)}
                aria-label="Copy filters to a new group"
              >
                <Copy />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Copy filters to a new group</Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon-sm"
                onclick={() => onremovegroup(group)}
                class="hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 dark:hover:bg-destructive/20"
                aria-label="Delete group"
              >
                <Trash2 />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Delete group</Tooltip.Content>
        </Tooltip.Root>
      </div>
    </Card.Action>
  </Card.Header>

  <Card.Content class="px-0">
    <ol class="flex flex-col">
      {#each filters as filter, index (index)}
        {@const described = describeGroupFilter(filter)}
        {@const measured = impact(index)}
        {@const pct = retained(index)}
        <li
          draggable="true"
          ondragstart={() => (dragging = index)}
          ondragover={(event) => event.preventDefault()}
          ondrop={() => drop(index)}
          ondragend={() => (dragging = null)}
          class="border-border flex items-center gap-3 border-t px-6 py-3 {editingIndex === index
            ? 'bg-muted'
            : ''} {dragging === index ? 'opacity-50' : ''}"
        >
          <span
            class="text-muted-foreground flex shrink-0 cursor-grab items-center gap-1"
            aria-hidden="true"
          >
            <GripVertical class="size-3.5" />
            <span class="w-4 font-mono text-xs">{index + 1}</span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{described.title}</p>
            <p class="text-muted-foreground truncate font-mono text-xs">{described.detail}</p>
          </div>

          <div class="w-40 shrink-0">
            {#if measured && pct !== null}
              <div class="flex items-center gap-2">
                <!-- The kept portion wears the Group's own colour; the
                       indicator's default is the primary accent. -->
                <Progress
                  value={pct}
                  class="h-1.5 [&_[data-slot=progress-indicator]]:bg-(--group-accent)"
                  style="--group-accent: {accent}"
                />
                <span class="text-muted-foreground w-9 shrink-0 text-right font-mono text-xs">
                  {pct}%
                </span>
              </div>
              <p class="text-muted-foreground mt-1 text-right font-mono text-[0.6875rem]">
                {formatNumber(measured.after.cases)} / {formatNumber(measured.before.cases)} cases
              </p>
            {:else if measureError}
              <p class="text-destructive text-right text-[0.6875rem]" title={measureError}>
                Could not measure these filters
              </p>
            {:else}
              <Skeleton class="h-4 w-full" />
            {/if}
          </div>

          <div class="flex shrink-0 gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => onedit(group, index)}
              aria-label="Edit filter"
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={filters.length === 1}
              onclick={() => removeFromDraft(group, index)}
              class="hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 dark:hover:bg-destructive/20"
              aria-label="Remove filter"
              title={filters.length === 1
                ? "A group needs at least one filter. Delete the group instead."
                : "Remove filter"}
            >
              <Trash2 />
            </Button>
          </div>
        </li>
      {/each}
    </ol>
  </Card.Content>

  {#if pending}
    <Card.Footer class="justify-end gap-2 border-t pt-4">
      {#if dirty}
        <Button variant="ghost" size="sm" onclick={() => discardDraft(group)}>
          <Undo2 data-icon="inline-start" />
          Discard
        </Button>
      {/if}
      <Button
        size="sm"
        onclick={() => onapply(group)}
        class="text-background bg-(--group-accent) hover:bg-(--group-accent) hover:opacity-90"
        style="--group-accent: {accent}"
      >
        <Check data-icon="inline-start" />
        Apply filters
      </Button>
    </Card.Footer>
  {/if}
</Card.Root>

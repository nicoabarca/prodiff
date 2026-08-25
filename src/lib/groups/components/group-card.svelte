<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { loadImpact, renameGroup, groupSteps } from "$lib/groups/state/groups.svelte";
  import type { ResponseFilterStep } from "$lib/groups/invokers/types";
  import { describeFilter } from "$lib/filters/kind/filter";
  import { colorVar, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import type { Group } from "$lib/groups/types";
  import Plus from "@lucide/svelte/icons/plus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";

  let {
    project,
    group,
    editingIndex = null,
    onedit,
    onremovefilter,
    onremovegroup
  }: {
    project: Project;
    group: Group;
    /** Which of this Group's filters the editor is on, if any. */
    editingIndex?: number | null;
    onedit: (group: Group, index: number | null) => void;
    onremovefilter: (group: Group, index: number) => void;
    onremovegroup?: (group: Group) => void;
  } = $props();

  const accent = $derived(colorVar(group.color));

  // Measurement lives in the shared cache, so the comparison summary reads the same scan.
  const steps = $derived(groupSteps(group));

  let measureError = $state<string | null>(null);

  $effect(() => {
    measureError = null;
    loadImpact(project, group).catch((cause) => {
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
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>
      <span class="flex items-center gap-2">
        <span
          class="size-2.5 shrink-0 rounded-full"
          style="background:{accent}"
          aria-hidden="true"
        ></span>
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
      </span>
    </Card.Title>
    <Card.Description>
      {group.filters.length === 0
        ? "Runs on the whole event log."
        : `${group.filters.length} ${group.filters.length === 1 ? "filter" : "filters"}, applied in order.`}
    </Card.Description>
    <Card.Action>
      <div class="flex gap-1">
        <Button variant="outline" size="sm" onclick={() => onedit(group, null)}>
          <Plus data-icon="inline-start" />
          Add filter
        </Button>
        {#if onremovegroup}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon-sm"
                  onclick={() => onremovegroup(group)}
                  aria-label="Delete group"
                >
                  <Trash2 />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Delete group</Tooltip.Content>
          </Tooltip.Root>
        {/if}
      </div>
    </Card.Action>
  </Card.Header>

  <Card.Content class="px-0">
    {#if group.filters.length === 0}
      <Empty.Root class="py-6">
        <Empty.Header>
          <Empty.Media variant="icon">
            <SlidersHorizontal />
          </Empty.Media>
          <Empty.Description>No filters — this group is the whole event log.</Empty.Description>
        </Empty.Header>
      </Empty.Root>
    {:else}
      <ol class="flex flex-col">
        {#each group.filters as filter, index (index)}
          {@const described = describeFilter(filter)}
          {@const measured = impact(index)}
          {@const pct = retained(index)}
          <li
            class="border-border flex items-center gap-3 border-t px-6 py-3 {editingIndex === index
              ? 'bg-muted'
              : ''}"
          >
            <span class="text-muted-foreground w-4 shrink-0 font-mono text-xs">
              {index + 1}
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
                onclick={() => onremovefilter(group, index)}
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
</Card.Root>

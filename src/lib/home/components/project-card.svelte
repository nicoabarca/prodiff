<script lang="ts">
  import type { Project } from "$lib/event-log/types";
  import { openedAt } from "$lib/event-log/state/opened.svelte";
  import {
    colorVar,
    formatDecimal,
    formatDuration,
    formatFileSize,
    formatNumber
  } from "$lib/format";
  import { ORIGINAL_COLOR } from "$lib/groups/colors";
  import { ORIGINAL_ID, ORIGINAL_NAME, type Group } from "$lib/groups/types";
  import DeleteProjectButton from "$lib/home/components/delete-project-button.svelte";
  import { figuresOf, loadFigures, recordsOf } from "$lib/home/state/overviews.svelte";
  import { monthYear, openedLabel, shortCount } from "$lib/home/utils/format";
  import { cn } from "$lib/utils";
  import FileText from "@lucide/svelte/icons/file-text";
  import Network from "@lucide/svelte/icons/network";
  import SquareFunction from "@lucide/svelte/icons/square-function";

  let {
    project,
    latest,
    onOpen
  }: { project: Project; latest: boolean; onOpen: (project: Project) => void } = $props();

  const MAX_GROUPS = 3;

  $effect(() => loadFigures(project));

  const figures = $derived(figuresOf(project));
  const records = $derived(recordsOf(project.id));
  const opened = $derived(openedAt[project.id] ?? null);

  const stats = $derived([
    { label: "Cases", value: formatNumber(project.cases) },
    { label: "Events", value: shortCount(project.events) },
    { label: "Activities", value: formatNumber(project.activities) },
    { label: "Variants", value: formatNumber(project.variants) }
  ]);

  const shownGroups = $derived(records.groups.slice(0, MAX_GROUPS));
  const hiddenGroups = $derived(records.groups.length - shownGroups.length);

  function share(group: Group): number | null {
    return group.stats ? Math.round((group.stats.cases / Math.max(project.cases, 1)) * 100) : null;
  }

  const compared = $derived(
    records.comparedIds
      .map((id) =>
        id === ORIGINAL_ID
          ? { name: ORIGINAL_NAME, color: ORIGINAL_COLOR }
          : (records.groups.find((group) => group.id === id && group.stats !== null) ?? null)
      )
      .filter((group) => group !== null)
      .slice(0, 2)
  );

  const attributes = $derived(
    records.customAttributes === 0
      ? "No custom attributes"
      : `${records.customAttributes} custom ${records.customAttributes === 1 ? "attribute" : "attributes"}`
  );
</script>

<li class="group relative">
  <div
    role="button"
    tabindex="0"
    aria-label={`Open ${project.name}`}
    class="bg-card text-card-foreground ring-foreground/10 hover:ring-primary hover:shadow-primary/25 flex h-full cursor-pointer flex-col text-xs/relaxed ring-1 transition-all hover:shadow-lg hover:ring-2"
    onclick={() => onOpen(project)}
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen(project);
      }
    }}
  >
    <div class="grid gap-0.5 px-4 pt-4">
      <div class="flex items-start justify-between gap-3">
        <span class="font-heading text-base font-medium">{project.name}</span>
        {#if opened}
          <span
            class={cn(
              "mt-0.5 shrink-0 text-[0.6875rem]",
              latest
                ? "bg-primary/10 text-primary flex h-5 items-center px-2 font-medium"
                : "text-muted-foreground"
            )}
          >
            Opened {openedLabel(opened)}
          </span>
        {:else}
          <span class="text-muted-foreground mt-0.5 shrink-0 text-[0.6875rem]">
            Added {openedLabel(project.createdAt)}
          </span>
        {/if}
      </div>
      <p class="text-muted-foreground flex items-center gap-1.5">
        <FileText class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="truncate">{project.fileName}</span>
        {#if figures?.size != null}
          <span aria-hidden="true">·</span>
          <span class="whitespace-nowrap">{formatFileSize(figures.size)}</span>
        {/if}
      </p>
    </div>

    <div class="flex flex-col gap-1 px-4 pt-3.5">
      <div class="flex h-8 items-end gap-px" aria-hidden="true">
        {#each figures?.bars ?? [] as bar, index (index)}
          <div class="bg-primary/30 flex-1" style:height="{bar}%"></div>
        {:else}
          <div class="bg-muted h-full flex-1"></div>
        {/each}
      </div>
      <div class="text-muted-foreground flex justify-between text-[0.625rem]">
        <span>{project.timespanStart ? monthYear(project.timespanStart) : ""}</span>
        <span>Open cases over time</span>
        <span>{project.timespanEnd ? monthYear(project.timespanEnd) : ""}</span>
      </div>
    </div>

    <dl class="border-border mx-4 mt-3.5 grid grid-cols-4 gap-3 border-t pt-3">
      {#each stats as stat (stat.label)}
        <div>
          <dt class="text-muted-foreground text-[0.625rem] tracking-widest uppercase">
            {stat.label}
          </dt>
          <dd class="text-sm font-semibold tabular-nums">{stat.value}</dd>
        </div>
      {/each}
    </dl>
    <p class="text-muted-foreground mx-4 mt-1 min-h-[1.1rem] text-[0.6875rem]">
      {#if figures?.stats}
        {formatDecimal(figures.stats.avgEventsPerCase, 1)} events per case · median case
        {formatDuration(figures.stats.medianCaseDurationMs)}
      {/if}
    </p>

    <div class="border-border mx-4 mt-3 flex flex-col gap-1.5 border-t pt-2.5">
      <div
        class="text-muted-foreground flex justify-between text-[0.625rem] tracking-widest uppercase"
      >
        <span>Groups · {records.groups.length}</span>
        {#if records.groups.length > 0}<span>Share of cases</span>{/if}
      </div>
      {#each shownGroups as group (group.id)}
        {@const percent = share(group)}
        <div class="grid grid-cols-[0.625rem_minmax(0,1fr)_4.5rem_3.75rem] items-center gap-2">
          <span class="size-2.5" style:background={colorVar(group.color)}></span>
          <span class="truncate">{group.name}</span>
          <span class="bg-muted flex h-1">
            {#if percent !== null}
              <span style:width="{percent}%" style:background={colorVar(group.color)}></span>
            {/if}
          </span>
          <span class="text-muted-foreground text-right tabular-nums">
            {percent === null ? "Not applied" : `${percent}%`}
          </span>
        </div>
      {/each}
      {#if hiddenGroups > 0}
        <span class="text-muted-foreground text-[0.6875rem]">+{hiddenGroups} more</span>
      {/if}
      {#if records.groups.length === 0}
        <span class="text-muted-foreground text-[0.6875rem]">
          No groups yet. Create them in Filters to start comparing.
        </span>
      {/if}
    </div>

    <div class="mt-auto pt-3">
      <div
        class="border-border text-muted-foreground flex items-center justify-between gap-3 border-t py-2.5 pr-12 pl-4 text-[0.6875rem]"
      >
        {#if compared.length > 0}
          <span class="flex min-w-0 flex-auto items-center gap-1.5 overflow-hidden">
            <Network class="size-3 shrink-0" aria-hidden="true" />
            <span class="shrink-0">{compared.length === 2 ? "Comparing" : "Showing"}</span>
            {#each compared as group, index (index)}
              {#if index === 1}<span class="shrink-0">vs</span>{/if}
              <span class="size-2 shrink-0" style:background={colorVar(group.color)}></span>
              <span class="text-foreground min-w-0 truncate">{group.name}</span>
            {/each}
          </span>
        {:else}
          <span>No comparison set</span>
        {/if}
        <span class="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <SquareFunction class="size-3" aria-hidden="true" />
          {attributes}
        </span>
      </div>
    </div>
  </div>

  <div
    class="absolute right-2 bottom-1.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
  >
    <DeleteProjectButton {project} />
  </div>
</li>

<script lang="ts">
  /**
   * A project's Event Log: its name and figures, the Columns tab that edits what
   * each column means, and a Data tab the route fills with the log browser.
   * `data` is handed a callback that switches to Columns.
   */
  import { untrack, type Snippet } from "svelte";
  import { Input } from "$lib/components/ui/input/index.js";
  import { formatDay, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import { updateProject } from "$lib/event-log/state/projects.svelte";
  import type { ColumnEdits } from "$lib/event-log/utils/column-edits";
  import ColumnsEditor from "$lib/event-log/components/page/columns-editor.svelte";
  import Pencil from "@lucide/svelte/icons/pencil";

  let {
    project,
    readers = {},
    data
  }: {
    project: Project;
    readers?: Record<string, string[]>;
    data: Snippet<[() => void]>;
  } = $props();

  let tab = $state<"columns" | "data">("columns");
  let edits = $state<ColumnEdits>({});

  // The name field is only re-seeded when the addressed project changes, so a
  // half-typed name is not clobbered by the write-back of an earlier save. Hence
  // the untracked initial read.
  let name = $state(untrack(() => project.name));
  let seeded = untrack(() => project.id);
  $effect(() => {
    if (seeded !== project.id) {
      seeded = project.id;
      name = project.name;
      edits = {};
    }
  });

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      name = project.name;
      return;
    }
    updateProject(project.id, { name: trimmed });
  }

  const visible = $derived(project.columns.length - project.hiddenColumns.length);
  const facts = $derived([
    { key: "File", value: project.fileName },
    { key: "Events", value: formatNumber(project.events) },
    { key: "Cases", value: formatNumber(project.cases) },
    { key: "Activities", value: formatNumber(project.activities) },
    { key: "Variants", value: formatNumber(project.variants) },
    {
      key: "Timespan",
      value:
        project.timespanStart && project.timespanEnd
          ? `${formatDay(Date.parse(project.timespanStart))} → ${formatDay(Date.parse(project.timespanEnd))}`
          : "—"
    }
  ]);
  const tabs = $derived([
    { id: "columns" as const, label: "Columns", count: `${visible}/${project.columns.length}` },
    { id: "data" as const, label: "Data", count: formatNumber(project.events) }
  ]);
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
  <div class="bg-card shrink-0 border-b">
    <div class="flex flex-wrap items-end gap-x-6 gap-y-3 px-6 pt-4.5 pb-3.5">
      <div class="flex min-w-72 flex-col gap-1.5">
        <label
          for="project-name"
          class="text-muted-foreground text-[0.625rem] font-bold tracking-widest uppercase"
        >
          Project name
        </label>
        <div class="relative w-76">
          <Input
            id="project-name"
            class="h-8 pr-8 text-sm font-semibold"
            bind:value={name}
            onblur={commitName}
            onkeydown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") name = project.name;
            }}
          />
          <Pencil
            class="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-3.25 -translate-y-1/2"
            aria-hidden="true"
          />
        </div>
      </div>
      <dl class="flex flex-wrap gap-x-6 gap-y-1.5 pb-1.5">
        {#each facts as fact (fact.key)}
          <div class="flex flex-col gap-0.5">
            <dt class="text-muted-foreground text-[0.625rem] font-bold tracking-[0.06em] uppercase">
              {fact.key}
            </dt>
            <dd class="font-mono text-xs whitespace-nowrap">{fact.value}</dd>
          </div>
        {/each}
      </dl>
    </div>
    <div class="flex gap-0.5 px-5" role="tablist">
      {#each tabs as entry (entry.id)}
        <button
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          class="inline-flex h-9 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs {tab ===
          entry.id
            ? 'border-primary text-foreground font-semibold'
            : 'text-muted-foreground hover:text-foreground border-transparent font-medium'}"
          onclick={() => (tab = entry.id)}
        >
          {entry.label}
          <span class="text-muted-foreground font-mono text-[0.6875rem]">{entry.count}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if tab === "columns"}
    <main class="bg-sidebar min-h-0 flex-1 overflow-auto">
      <ColumnsEditor {project} {readers} bind:edits />
    </main>
  {:else}
    <main class="bg-sidebar flex min-h-0 flex-1 flex-col p-5">
      <section class="bg-card ring-foreground/10 flex min-h-0 flex-1 flex-col ring-1">
        {@render data(() => (tab = "columns"))}
      </section>
    </main>
  {/if}
</div>

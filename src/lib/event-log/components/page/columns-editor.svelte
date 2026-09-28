<script lang="ts">
  /**
   * The Columns tab: per column its visibility, scope, case resolution and data
   * type, edited as a draft until Save. Required columns (case id, activity,
   * timestamps) are shown but locked. A column in `readers` is read by the
   * Custom Attributes it names, so it can be neither hidden nor retyped.
   */
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { columnProfiles } from "$lib/event-log/invokers/column-profiles";
  import type {
    CaseResolution,
    ColumnScope,
    ResponseColumnProfile
  } from "$lib/event-log/invokers/types";
  import type { Project } from "$lib/event-log/types";
  import { updateProject } from "$lib/event-log/state/projects.svelte";
  import {
    editedColumns,
    savedColumns,
    type ColumnEdit,
    type ColumnEdits,
    type EditableColumn
  } from "$lib/event-log/utils/column-edits";
  import {
    CASE_RESOLUTION_LABELS,
    CASE_RESOLUTION_OPTIONS,
    EXTRA_FIELD_TYPES,
    EXTRA_FIELD_TYPE_LABELS,
    SCOPE_LABELS,
    SCOPE_OPTIONS,
    type ExtraFieldType
  } from "$lib/event-log/utils/field-settings";
  import { roleMeta, type AssignableRole } from "$lib/event-log/utils/roles";
  import { invalidateTree } from "$lib/tree/state/build.svelte";

  let {
    project,
    readers = {},
    edits = $bindable({})
  }: { project: Project; readers?: Record<string, string[]>; edits?: ColumnEdits } = $props();

  /** Below this share of events carrying a value, the fill rate is flagged. */
  const LOW_FILL = 0.9;

  let profiles = $state<Record<string, ResponseColumnProfile>>({});
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  $effect(() => {
    const id = project.id;
    const names = project.columns.map((column) => column.name);
    let stale = false;
    columnProfiles(id, names)
      .then((result) => {
        if (!stale) profiles = Object.fromEntries(result.map((p) => [p.name, p]));
      })
      .catch(() => {
        if (!stale) profiles = {};
      });
    return () => {
      stale = true;
    };
  });

  const columns = $derived(editedColumns(project, edits));
  const required = $derived(columns.filter((column) => column.role !== "other"));
  const attributes = $derived(columns.filter((column) => column.role === "other"));
  const changed = $derived(columns.filter((column) => column.changed));
  const structural = $derived(changed.some((column) => column.structural));

  function edit(name: string, patch: ColumnEdit) {
    edits = { ...edits, [name]: { ...edits[name], ...patch } };
  }

  async function save() {
    saving = true;
    saveError = null;
    try {
      const next = savedColumns(project, edits);
      await updateProject(project.id, next);
      if (structural) invalidateTree();
      edits = {};
    } catch (cause) {
      saveError = String(cause);
    } finally {
      saving = false;
    }
  }

  function fill(name: string): { text: string; low: boolean } {
    const profile = profiles[name];
    if (!profile) return { text: "", low: false };
    const percent = profile.filled * 100;
    return {
      text: `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`,
      low: profile.filled < LOW_FILL
    };
  }
</script>

{#snippet row(column: EditableColumn)}
  {@const locked = column.role !== "other"}
  {@const readBy = readers[column.name] ?? []}
  {@const read = readBy.length > 0}
  {@const filled = fill(column.name)}
  <div class="flex flex-col border-b last:border-b-0 {column.changed ? 'bg-primary/5' : ''}">
    <div
      class="flex items-center gap-3 px-4 py-1.75 {!locked && !column.visible ? 'opacity-60' : ''}"
    >
      <span class="flex w-36 shrink-0 items-center gap-2">
        {#if locked}
          <Badge variant="secondary">
            {roleMeta[column.role as AssignableRole]?.label ?? column.role}
          </Badge>
        {:else}
          <label
            class="text-muted-foreground flex items-center gap-2 text-xs {read
              ? 'cursor-not-allowed'
              : 'cursor-pointer'}"
          >
            <Checkbox
              checked={column.visible}
              disabled={read}
              onCheckedChange={(checked) => edit(column.name, { visible: checked === true })}
            />
            {column.visible ? "Shown" : "Hidden"}
          </label>
        {/if}
      </span>
      <span class="flex w-36 shrink-0 items-center gap-1.5 font-mono text-xs font-semibold">
        <span class="truncate" title={column.name}>{column.name}</span>
        {#if column.changed}
          <span class="bg-primary size-1.5 shrink-0 rounded-full" aria-label="Changed"></span>
        {/if}
      </span>
      <span class="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[0.6875rem]">
        {profiles[column.name]?.sample.join(", ") ?? ""}
      </span>
      <span
        class="w-13 shrink-0 text-right font-mono text-[0.6875rem] {filled.low
          ? 'text-destructive'
          : 'text-muted-foreground'}"
      >
        {filled.text}
      </span>
      <span class="w-24 shrink-0">
        <Select.Root
          type="single"
          value={column.scope}
          onValueChange={(value) => edit(column.name, { scope: value as ColumnScope })}
        >
          <Select.Trigger size="sm" class="bg-background h-6.5! w-24" disabled={locked}>
            {SCOPE_LABELS[column.scope]}
          </Select.Trigger>
          <Select.Content>
            {#each SCOPE_OPTIONS as option (option)}
              <Select.Item value={option} label={SCOPE_LABELS[option]} />
            {/each}
          </Select.Content>
        </Select.Root>
      </span>
      <span class="w-32 shrink-0">
        {#if column.scope === "case"}
          <Select.Root
            type="single"
            value={column.caseResolution}
            onValueChange={(value) =>
              edit(column.name, { caseResolution: value as CaseResolution })}
          >
            <Select.Trigger size="sm" class="bg-background h-6.5! w-32" disabled={locked}>
              {CASE_RESOLUTION_LABELS[column.caseResolution]}
            </Select.Trigger>
            <Select.Content>
              {#each CASE_RESOLUTION_OPTIONS as option (option)}
                <Select.Item value={option} label={CASE_RESOLUTION_LABELS[option]} />
              {/each}
            </Select.Content>
          </Select.Root>
        {:else}
          <span class="text-muted-foreground/60 text-[0.6875rem]">—</span>
        {/if}
      </span>
      <span class="w-24 shrink-0">
        <Select.Root
          type="single"
          value={column.type}
          onValueChange={(value) => edit(column.name, { type: value as ExtraFieldType })}
        >
          <Select.Trigger size="sm" class="bg-background h-6.5! w-24" disabled={locked || read}>
            {EXTRA_FIELD_TYPE_LABELS[column.type]}
          </Select.Trigger>
          <Select.Content>
            {#each EXTRA_FIELD_TYPES as option (option)}
              <Select.Item value={option} label={EXTRA_FIELD_TYPE_LABELS[option]} />
            {/each}
          </Select.Content>
        </Select.Root>
      </span>
    </div>
    {#if read}
      <p class="text-muted-foreground pb-2 pl-44 text-[0.6875rem]">
        Read by the custom attribute{readBy.length === 1 ? "" : "s"}
        {readBy.join(", ")}. Edit {readBy.length === 1 ? "that formula" : "those formulas"} to hide or
        retype it.
      </p>
    {/if}
  </div>
{/snippet}

{#snippet section(title: string, sub: string, firstHead: string, rows: EditableColumn[])}
  <section class="bg-card ring-foreground/10 ring-1">
    <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b px-4 py-3">
      <span class="text-[0.6875rem] font-bold tracking-[0.12em] uppercase">{title}</span>
      <span class="text-muted-foreground text-xs">{sub}</span>
    </div>
    <div
      class="bg-sidebar text-muted-foreground flex items-center gap-3 border-b px-4 py-1.75 text-[0.625rem] font-bold tracking-[0.06em] uppercase"
    >
      <span class="w-36 shrink-0">{firstHead}</span>
      <span class="w-36 shrink-0">Column</span>
      <span class="min-w-0 flex-1">Sample</span>
      <span class="w-13 shrink-0 text-right">Filled</span>
      <span class="w-24 shrink-0">Scope</span>
      <span class="w-32 shrink-0">Case resolution</span>
      <span class="w-24 shrink-0">Data type</span>
    </div>
    {#each rows as column (column.name)}
      {@render row(column)}
    {/each}
  </section>
{/snippet}

<div class="mx-auto flex w-full max-w-[67.5rem] flex-col gap-4 px-6 pt-5 pb-24">
  {@render section(
    "Required fields",
    "Set when the project was created. Scope and type follow from the role.",
    "Role",
    required
  )}
  {#if attributes.length > 0}
    {@render section(
      "Attributes",
      `${attributes.filter((c) => c.visible).length} of ${attributes.length} shown in tables, statistics and filters`,
      "Visible",
      attributes
    )}
  {/if}
  <p class="text-muted-foreground max-w-[80ch] text-xs/relaxed text-pretty">
    A column's type decides which Significance Test it gets, and its scope decides whether it
    aggregates per node or per group, so changing either discards the built tree. A case-scoped
    column is read from the event its resolution names. Declaring a text column as a number reads as
    empty, not as an error. Visibility only affects what tables and statistics show. The stored
    event log is not re-parsed, so require constant is not re-checked here.
  </p>
</div>

{#if changed.length > 0}
  <div
    class="bg-foreground text-background absolute inset-x-6 bottom-4 z-10 flex flex-wrap items-center gap-x-4 gap-y-2.5 py-2.5 pr-3 pl-4 shadow-lg"
    role="status"
  >
    <span class="text-xs font-semibold">
      {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
    </span>
    <span class="text-xs {structural ? 'text-destructive font-medium' : 'text-background/70'}">
      {#if saveError}
        {saveError}
      {:else if structural}
        Scope or type changed. Saving discards the built tree.
      {:else}
        Visibility only. The tree is kept.
      {/if}
    </span>
    <div class="ml-auto flex gap-2">
      <Button
        size="sm"
        variant="outline"
        class="border-background/30 text-background hover:bg-background/10 hover:text-background bg-transparent"
        disabled={saving}
        onclick={() => (edits = {})}
      >
        Discard
      </Button>
      <Button size="sm" disabled={saving} onclick={save}>
        {structural ? "Save and rebuild" : "Save"}
      </Button>
    </div>
  </div>
{/if}

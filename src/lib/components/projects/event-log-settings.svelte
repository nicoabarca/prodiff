<script lang="ts">
  /**
   * Post-creation edits to what the event log *means*: the project's name, and
   * per column its visibility, granularity and data type. The wizard asks all
   * of this once at upload; this is the same set of decisions, revisited.
   *
   * Required columns (case id, activity, timestamps) are shown but locked —
   * their granularity and type are fixed by the role they play, exactly as in
   * `requiredFieldSettings`, and hiding one would break every analysis.
   */
  import { untrack } from "svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    EXTRA_FIELD_TYPES,
    EXTRA_FIELD_TYPE_LABELS,
    GRANULARITY_LABELS,
    GRANULARITY_OPTIONS,
    extraFieldTypeToColumnType,
    inferExtraFieldType,
    type ExtraFieldType
  } from "$lib/projects/field-settings";
  import { roleMeta, type AssignableRole } from "$lib/projects/roles";
  import { updateProject } from "$lib/state/projects.svelte";
  import { invalidateTree } from "$lib/state/tree.svelte";
  import type { ColumnGranularity } from "$lib/column-mapping";
  import type { Project } from "$lib/types";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Settings2 from "@lucide/svelte/icons/settings-2";

  let { project }: { project: Project } = $props();

  let open = $state(false);

  // The name field is only re-seeded when the addressed project changes, so a
  // half-typed name isn't clobbered by the write-back of an earlier save —
  // hence the untracked initial read.
  let name = $state(untrack(() => project.name));
  let seeded = untrack(() => project.id);
  $effect(() => {
    if (seeded !== project.id) {
      seeded = project.id;
      name = project.name;
    }
  });

  const required = $derived(
    new Set(project.columns.filter((c) => c.role !== "other").map((c) => c.name))
  );

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      name = project.name;
      return;
    }
    updateProject(project.id, { name: trimmed });
  }

  function toggleVisible(columnName: string, visible: boolean) {
    const hiddenColumns = visible
      ? project.hiddenColumns.filter((c) => c !== columnName)
      : [...project.hiddenColumns, columnName];
    updateProject(project.id, { hiddenColumns });
  }

  function setColumn(
    columnName: string,
    changes: { granularity?: ColumnGranularity; type?: ExtraFieldType }
  ) {
    const columns = project.columns.map((column) =>
      column.name === columnName
        ? {
            ...column,
            granularity: changes.granularity ?? column.granularity,
            type: changes.type ? extraFieldTypeToColumnType(changes.type) : column.type
          }
        : column
    );
    updateProject(project.id, { columns });
    invalidateTree();
  }
</script>

<section class="border-border bg-card border">
  <button
    type="button"
    class="hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-2.5 text-left"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    {#if open}
      <ChevronDown class="size-4 shrink-0" aria-hidden="true" />
    {:else}
      <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
    {/if}
    <Settings2 class="size-4 shrink-0" aria-hidden="true" />
    <span class="text-sm font-semibold">Event log settings</span>
    <span class="text-muted-foreground truncate text-xs">
      {project.name} · {project.columns.length - project.hiddenColumns.length} of {project.columns
        .length} columns visible
    </span>
  </button>

  {#if open}
    <div class="border-border flex flex-col gap-4 border-t p-4">
      <div class="flex max-w-md flex-col gap-1.5">
        <Label class="text-xs" for="project-name">Project name</Label>
        <Input
          id="project-name"
          class="h-8 text-sm"
          bind:value={name}
          onblur={commitName}
          onkeydown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") name = project.name;
          }}
        />
      </div>

      <div class="border-border max-h-80 overflow-y-auto border">
        <Table.Root>
          <Table.Header class="sticky top-0 z-10">
            <Table.Row class="hover:bg-transparent">
              <Table.Head class="w-16">Visible</Table.Head>
              <Table.Head>Column</Table.Head>
              <Table.Head>Role</Table.Head>
              <Table.Head>Granularity</Table.Head>
              <Table.Head>Data type</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each project.columns as column (column.name)}
              {@const locked = required.has(column.name)}
              {@const type = inferExtraFieldType(column.type)}
              <Table.Row class="hover:bg-primary/5">
                <Table.Cell>
                  <Checkbox
                    checked={!project.hiddenColumns.includes(column.name)}
                    disabled={locked}
                    aria-label="Show {column.name}"
                    onCheckedChange={(checked) => toggleVisible(column.name, checked === true)}
                  />
                </Table.Cell>
                <Table.Cell class="font-mono text-xs">{column.name}</Table.Cell>
                <Table.Cell>
                  {#if locked}
                    <Badge variant="secondary">
                      {roleMeta[column.role as AssignableRole]?.label ?? column.role}
                    </Badge>
                  {:else}
                    <span class="text-muted-foreground text-xs">Attribute</span>
                  {/if}
                </Table.Cell>
                <Table.Cell>
                  <Select.Root
                    type="single"
                    value={column.granularity}
                    onValueChange={(value) =>
                      setColumn(column.name, { granularity: value as ColumnGranularity })}
                  >
                    <Select.Trigger size="sm" class="w-36" disabled={locked}>
                      {GRANULARITY_LABELS[column.granularity]}
                    </Select.Trigger>
                    <Select.Content>
                      {#each GRANULARITY_OPTIONS as option (option)}
                        <Select.Item value={option} label={GRANULARITY_LABELS[option]} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </Table.Cell>
                <Table.Cell>
                  <Select.Root
                    type="single"
                    value={type}
                    onValueChange={(value) =>
                      setColumn(column.name, { type: value as ExtraFieldType })}
                  >
                    <Select.Trigger size="sm" class="w-28" disabled={locked}>
                      {EXTRA_FIELD_TYPE_LABELS[type]}
                    </Select.Trigger>
                    <Select.Content>
                      {#each EXTRA_FIELD_TYPES as option (option)}
                        <Select.Item value={option} label={EXTRA_FIELD_TYPE_LABELS[option]} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>

      <p class="text-muted-foreground text-xs">
        A column's type decides which Significance Test it gets and its granularity decides whether
        it aggregates per node or per group, so changing either discards the built tree. Declaring a
        text column as a number reads as empty, not as an error — the stored event log is not
        re-parsed.
      </p>
      <div class="flex justify-end">
        <Button size="sm" onclick={() => (open = false)}>Done</Button>
      </div>
    </div>
  {/if}
</section>

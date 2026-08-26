<script lang="ts">
  import type { ColumnGranularity, ColumnType } from "$lib/event-log/invokers/types";
  import { roleMeta, type AssignableRole } from "$lib/event-log/utils/roles";
  import {
    EXTRA_FIELD_TYPES,
    EXTRA_FIELD_TYPE_LABELS,
    GRANULARITY_OPTIONS,
    GRANULARITY_LABELS,
    GRANULARITY_DESCRIPTIONS,
    inferExtraFieldType,
    type ExtraFieldType
  } from "$lib/event-log/utils/field-settings";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import Info from "@lucide/svelte/icons/info";

  let {
    columns,
    rows,
    roleByColumn,
    visibleColumns,
    columnGranularity = $bindable(),
    columnType = $bindable()
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    roleByColumn: Record<string, AssignableRole>;
    visibleColumns: Set<string>;
    columnGranularity: Record<string, ColumnGranularity>;
    columnType: Record<string, ExtraFieldType>;
  } = $props();

  const fieldRows = $derived(
    columns
      .map((c, index) => ({ ...c, index }))
      .filter((c) => !roleByColumn[c.name] && visibleColumns.has(c.name))
  );

  /** The case id and activity always lead the preview, whatever was kept. */
  const contextRows = $derived(
    (["case_id", "activity_name"] as AssignableRole[]).flatMap((role) => {
      const index = columns.findIndex((c) => roleByColumn[c.name] === role);
      return index === -1 ? [] : [{ ...columns[index], index, role }];
    })
  );

  const previewColumns = $derived([
    ...contextRows,
    ...fieldRows.map((column) => ({ ...column, role: undefined }))
  ]);

  const previewRows = $derived(rows.map((row) => previewColumns.map(({ index }) => row[index])));

  function granularityFor(col: string): ColumnGranularity {
    return columnGranularity[col] ?? "event";
  }

  function typeFor(col: string, dtype: ColumnType): ExtraFieldType {
    return columnType[col] ?? inferExtraFieldType(dtype);
  }

  function setGranularity(col: string, value: string) {
    columnGranularity = { ...columnGranularity, [col]: value as ColumnGranularity };
  }

  function setType(col: string, value: string) {
    columnType = { ...columnType, [col]: value as ExtraFieldType };
  }

  function isCustomized(name: string, dtype: ColumnType): boolean {
    return granularityFor(name) !== "event" || typeFor(name, dtype) !== inferExtraFieldType(dtype);
  }
</script>

<div class="border-primary bg-primary/5 mb-5 flex shrink-0 gap-3 border-l-4 px-4 py-3">
  <Info class="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
  <div class="text-sm">
    <p class="text-foreground mb-1 font-semibold tracking-wide">Granularity</p>
    <dl class="space-y-0.5">
      {#each GRANULARITY_OPTIONS as option}
        <div class="flex gap-1.5">
          <dt class="text-foreground shrink-0 font-medium">{GRANULARITY_LABELS[option]}:</dt>
          <dd class="text-muted-foreground">{GRANULARITY_DESCRIPTIONS[option]}</dd>
        </div>
      {/each}
    </dl>
  </div>
</div>

{#if fieldRows.length === 0}
  <div class="border-border bg-card min-w-0 border">
    <div
      class="border-border bg-primary/5 border-b-primary/30 flex items-center justify-between border-b-2 px-4 py-2"
    >
      <span class="text-primary text-xs font-semibold tracking-widest uppercase"
        >Field settings</span
      >
    </div>
    <p class="text-muted-foreground px-4 py-8 text-center text-sm">
      No extra columns to configure. Every visible field is either required or was left out in the
      previous step.
    </p>
  </div>
{:else}
  <div class="flex min-h-0 flex-1 gap-4">
    <div class="border-border bg-card flex min-h-0 w-1/3 shrink-0 flex-col border">
      <div
        class="border-border bg-primary/5 border-b-primary/30 flex shrink-0 items-center justify-between border-b-2 px-4 py-2"
      >
        <span class="text-primary text-xs font-semibold tracking-widest uppercase"
          >Field settings</span
        >
        <span class="text-muted-foreground text-xs"
          >{fieldRows.length} field{fieldRows.length === 1 ? "" : "s"}</span
        >
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row class="hover:bg-transparent">
              <Table.Head>Field name</Table.Head>
              <Table.Head>Granularity</Table.Head>
              <Table.Head>Data type</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each fieldRows as { name, dtype }}
              {@const customized = isCustomized(name, dtype)}
              <Table.Row
                class={`hover:bg-primary/5 ${customized ? "border-l-primary border-l-2" : "border-l-2 border-l-transparent"}`}
              >
                <Table.Cell class="font-mono text-xs">
                  <span class="flex items-center gap-2">
                    <span
                      class={`h-1.5 w-1.5 shrink-0 rounded-full ${customized ? "bg-primary" : "bg-border"}`}
                      aria-hidden="true"
                    ></span>
                    {name}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Select.Root
                    type="single"
                    value={granularityFor(name)}
                    onValueChange={(value) => setGranularity(name, value)}
                  >
                    <Select.Trigger
                      size="sm"
                      class={`w-36 ${granularityFor(name) !== "event" ? "border-primary text-primary" : ""}`}
                    >
                      {GRANULARITY_LABELS[granularityFor(name)]}
                    </Select.Trigger>
                    <Select.Content>
                      {#each GRANULARITY_OPTIONS as option}
                        <Select.Item value={option} label={GRANULARITY_LABELS[option]} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </Table.Cell>
                <Table.Cell>
                  <Select.Root
                    type="single"
                    value={typeFor(name, dtype)}
                    onValueChange={(value) => setType(name, value)}
                  >
                    <Select.Trigger
                      size="sm"
                      class={`w-28 ${typeFor(name, dtype) !== inferExtraFieldType(dtype) ? "border-primary text-primary" : ""}`}
                    >
                      {EXTRA_FIELD_TYPE_LABELS[typeFor(name, dtype)]}
                    </Select.Trigger>
                    <Select.Content>
                      {#each EXTRA_FIELD_TYPES as option}
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
    </div>

    <div class="border-border bg-card flex min-h-0 min-w-0 flex-1 flex-col border">
      <div class="border-border flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span class="text-muted-foreground text-xs font-semibold tracking-widest uppercase"
          >Sample preview</span
        >
        <span class="text-muted-foreground text-xs">First {rows.length} rows</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Table.Root class="w-max min-w-full border-collapse">
          <Table.Header class="sticky top-0 z-10">
            <Table.Row class="hover:bg-transparent">
              {#each previewColumns as { name, role } (name)}
                <Table.Head class="font-mono text-xs whitespace-nowrap">
                  {name}
                  {#if role}
                    <span
                      class="text-primary ml-1 font-sans text-[0.625rem] tracking-wide uppercase"
                    >
                      {roleMeta[role].label}
                    </span>
                  {/if}
                </Table.Head>
              {/each}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each previewRows as row}
              <Table.Row class="hover:bg-transparent">
                {#each row as cell}
                  <Table.Cell
                    class="text-muted-foreground px-3 py-1.5 font-mono text-xs whitespace-nowrap"
                  >
                    {cell}
                  </Table.Cell>
                {/each}
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </div>
  </div>
{/if}

<script lang="ts">
  import type { CaseResolution, ColumnScope, ColumnType } from "$lib/event-log/invokers/types";
  import { roleMeta, type AssignableRole } from "$lib/event-log/utils/roles";
  import {
    EXTRA_FIELD_TYPES,
    EXTRA_FIELD_TYPE_LABELS,
    SCOPE_OPTIONS,
    SCOPE_LABELS,
    SCOPE_DESCRIPTIONS,
    SCOPE_GUIDANCE,
    CASE_RESOLUTION_OPTIONS,
    CASE_RESOLUTION_LABELS,
    CASE_RESOLUTION_DESCRIPTIONS,
    inferExtraFieldType,
    type ExtraFieldType
  } from "$lib/event-log/utils/field-settings";
  import type { CaseColumnChecks } from "$lib/event-log/state/case-columns.svelte";
  import type { TimestampFormats } from "$lib/event-log/state/timestamp-formats.svelte";
  import TimestampFormatField from "./timestamp-format-field.svelte";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils";
  import Info from "@lucide/svelte/icons/info";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";

  let {
    columns,
    rows,
    roleByColumn,
    visibleColumns,
    columnScope = $bindable(),
    columnResolution = $bindable(),
    columnType = $bindable(),
    timestampFormats,
    caseColumns
  }: {
    columns: { name: string; dtype: ColumnType }[];
    rows: string[][];
    roleByColumn: Record<string, AssignableRole>;
    visibleColumns: Set<string>;
    columnScope: Record<string, ColumnScope>;
    columnResolution: Record<string, CaseResolution>;
    columnType: Record<string, ExtraFieldType>;
    timestampFormats: TimestampFormats;
    caseColumns: CaseColumnChecks;
  } = $props();

  const fieldRows = $derived(
    columns
      .map((c, index) => ({ ...c, index }))
      .filter((c) => !roleByColumn[c.name] && visibleColumns.has(c.name))
  );

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

  function scopeFor(col: string): ColumnScope {
    return columnScope[col] ?? "event";
  }

  function resolutionFor(col: string): CaseResolution {
    return columnResolution[col] ?? "require_constant";
  }

  function typeFor(col: string, dtype: ColumnType): ExtraFieldType {
    return columnType[col] ?? inferExtraFieldType(dtype);
  }

  function setScope(col: string, value: string) {
    columnScope = { ...columnScope, [col]: value as ColumnScope };
  }

  function setResolution(col: string, value: string) {
    columnResolution = { ...columnResolution, [col]: value as CaseResolution };
  }

  function setType(col: string, value: string) {
    columnType = { ...columnType, [col]: value as ExtraFieldType };
  }

  function isCustomized(name: string, dtype: ColumnType): boolean {
    return scopeFor(name) !== "event" || typeFor(name, dtype) !== inferExtraFieldType(dtype);
  }

  const temporalFields = $derived(
    fieldRows.filter(({ name, dtype }) => typeFor(name, dtype) === "datetime")
  );

  const sharedFormat = $derived.by(() => {
    if (temporalFields.length < 2) return null;
    const patterns = temporalFields.map(({ name }) => timestampFormats.patterns[name] ?? "");
    if (patterns.some((p) => p === "")) return null;
    return patterns.every((p) => p === patterns[0]) ? null : patterns[0];
  });
</script>

<Alert.Root class="mb-5 shrink-0">
  <Info aria-hidden="true" />
  <div class="text-sm">
    <Alert.Title>Scope</Alert.Title>
    <dl class="flex flex-col gap-0.5">
      {#each SCOPE_OPTIONS as option}
        <div class="flex gap-1.5">
          <dt class="text-foreground shrink-0 font-medium">{SCOPE_LABELS[option]}:</dt>
          <dd class="text-muted-foreground">{SCOPE_DESCRIPTIONS[option]}</dd>
        </div>
      {/each}
      <div class="flex gap-1.5">
        <dt class="text-foreground shrink-0 font-medium">Case resolution:</dt>
        <dd class="text-muted-foreground">
          Which event of the case a case-scoped column is read from. {SCOPE_GUIDANCE}
        </dd>
      </div>
    </dl>
  </div>
</Alert.Root>

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
      {#if caseColumns.checking || caseColumns.error}
        <div class="border-border flex shrink-0 items-center gap-2 border-b px-4 py-2">
          {#if caseColumns.checking}
            <LoaderCircle class="text-muted-foreground size-3.5 animate-spin" aria-hidden="true" />
            <span class="text-muted-foreground text-xs">Checking the case-scoped columns…</span>
          {:else}
            <span class="text-destructive text-xs">
              Couldn't check the case-scoped columns: {caseColumns.error}
            </span>
          {/if}
        </div>
      {/if}
      {#if sharedFormat}
        <div
          class="border-border flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2"
        >
          <span class="text-muted-foreground text-xs">
            {temporalFields.length} timestamp columns, with different formats.
          </span>
          <Button
            variant="outline"
            size="sm"
            onclick={() =>
              timestampFormats.applyTo(
                temporalFields.map(({ name }) => name),
                sharedFormat
              )}
          >
            Use {sharedFormat} for all
          </Button>
        </div>
      {/if}
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Table.Root>
          <Table.Header>
            <Table.Row class="hover:bg-transparent">
              <Table.Head>Field name</Table.Head>
              <Table.Head>Scope</Table.Head>
              <Table.Head>Data type</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each fieldRows as { name, dtype }}
              {@const customized = isCustomized(name, dtype)}
              <Table.Row
                class={cn(
                  "hover:bg-primary/5 border-l-2",
                  customized ? "border-l-primary" : "border-l-transparent"
                )}
              >
                <Table.Cell class="font-mono text-xs">
                  <span class="flex items-center gap-2">
                    <span
                      class={cn(
                        "size-1.5 shrink-0 rounded-full",
                        customized ? "bg-primary" : "bg-border"
                      )}
                      aria-hidden="true"
                    ></span>
                    {name}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  {@const violation = caseColumns.violation(name)}
                  <div class="flex w-40 flex-col gap-1">
                    <Select.Root
                      type="single"
                      value={scopeFor(name)}
                      onValueChange={(value) => setScope(name, value)}
                    >
                      <Select.Trigger
                        size="sm"
                        class={cn("w-full", scopeFor(name) !== "event" && "border-primary")}
                      >
                        {SCOPE_LABELS[scopeFor(name)]}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Group>
                          {#each SCOPE_OPTIONS as option}
                            <Select.Item value={option} label={SCOPE_LABELS[option]} />
                          {/each}
                        </Select.Group>
                      </Select.Content>
                    </Select.Root>
                    {#if scopeFor(name) === "case"}
                      <Select.Root
                        type="single"
                        value={resolutionFor(name)}
                        onValueChange={(value) => setResolution(name, value)}
                      >
                        <Select.Trigger
                          size="sm"
                          class={cn("w-full", violation && "border-destructive")}
                        >
                          {CASE_RESOLUTION_LABELS[resolutionFor(name)]}
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Group>
                            {#each CASE_RESOLUTION_OPTIONS as option}
                              <Select.Item value={option} label={CASE_RESOLUTION_LABELS[option]} />
                            {/each}
                          </Select.Group>
                        </Select.Content>
                      </Select.Root>
                      <p class="text-muted-foreground text-xs">
                        {CASE_RESOLUTION_DESCRIPTIONS[resolutionFor(name)]}
                      </p>
                      {#if violation}
                        <p class="text-destructive text-xs">
                          {violation.cases}
                          {violation.cases === 1 ? "case carries" : "cases carry"} more than one value.
                          Case <span class="font-mono">{violation.exampleCase}</span> holds
                          <span class="font-mono">{violation.exampleValues[0]}</span>
                          and <span class="font-mono">{violation.exampleValues[1]}</span>. Read the
                          first or the last event instead, or move the column to event scope.
                        </p>
                      {/if}
                    {/if}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div class="flex w-44 flex-col gap-1">
                    <Select.Root
                      type="single"
                      value={typeFor(name, dtype)}
                      onValueChange={(value) => setType(name, value)}
                    >
                      <Select.Trigger
                        size="sm"
                        class={cn(
                          "w-full",
                          typeFor(name, dtype) !== inferExtraFieldType(dtype) && "border-primary"
                        )}
                      >
                        {EXTRA_FIELD_TYPE_LABELS[typeFor(name, dtype)]}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Group>
                          {#each EXTRA_FIELD_TYPES as option}
                            <Select.Item value={option} label={EXTRA_FIELD_TYPE_LABELS[option]} />
                          {/each}
                        </Select.Group>
                      </Select.Content>
                    </Select.Root>
                    {#if typeFor(name, dtype) === "datetime"}
                      <TimestampFormatField column={name} formats={timestampFormats} />
                    {/if}
                  </div>
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

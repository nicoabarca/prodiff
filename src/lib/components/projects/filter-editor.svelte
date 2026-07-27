<script lang="ts">
  import { untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import * as RadioGroup from "$lib/components/ui/radio-group/index.js";
  import * as ScrollArea from "$lib/components/ui/scroll-area/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    ATTRIBUTE_MODES,
    ATTRIBUTE_MODE_INFO,
    ENDPOINT_MODES,
    ENDPOINT_MODE_INFO,
    NUMERIC_MODES,
    NUMERIC_MODE_INFO,
    TIMEFRAME_MODES,
    TIMEFRAME_MODE_INFO,
    isFilterComplete,
    type AttributeMode,
    type EndpointMode,
    type EndpointPosition,
    type Filter,
    type FilterKind,
    type NumericMode,
    type TimeframeMode
  } from "$lib/filters";
  import { chainImpact, type ChainStep } from "$lib/state/slices.svelte";
  import { formatNumber } from "$lib/format";
  import type { Project } from "$lib/types";
  import Search from "@lucide/svelte/icons/search";

  let {
    project,
    filter = null,
    /** Filters applied before this one — the draft's impact is measured on top of them. */
    precedingChain = [],
    onsave,
    oncancel
  }: {
    project: Project;
    filter?: Filter | null;
    precedingChain?: Filter[];
    onsave: (filter: Filter) => void;
    oncancel: () => void;
  } = $props();

  /** Distinct values shown in the picker before it truncates. */
  const VALUE_LIMIT = 500;
  /** Debounce before re-measuring the draft against the log, in ms. */
  const IMPACT_DEBOUNCE = 250;

  interface ValueCount {
    value: string;
    cases: number;
  }

  const usable = $derived(project.columns.filter((c) => !project.hiddenColumns.includes(c.name)));
  const activityColumn = $derived(usable.find((c) => c.role === "activity_name")?.name ?? "");
  // Case ids and timestamps are excluded: filtering by an individual case id is
  // not a slice, and timestamps have their own filter kind.
  const categorical = $derived(
    usable.filter(
      (c) =>
        (c.type === "string" || c.type === "boolean") &&
        c.role !== "case_id" &&
        c.role !== "complete_timestamp" &&
        c.role !== "start_timestamp"
    )
  );
  const numericColumns = $derived(usable.filter((c) => c.type === "integer" || c.type === "float"));

  const kinds = $derived(
    [
      { kind: "attribute" as const, label: "Attribute", available: categorical.length > 0 },
      { kind: "numeric" as const, label: "Numeric", available: numericColumns.length > 0 },
      { kind: "timeframe" as const, label: "Timeframe", available: true },
      { kind: "endpoint" as const, label: "Start / end", available: activityColumn !== "" }
    ].filter((k) => k.available)
  );

  function toDateInput(millis: number): string {
    return new Date(millis).toISOString().slice(0, 10);
  }

  // The form is seeded from the filter being edited and then owns its own
  // state. Callers remount the editor (via `{#key}`) to point it at a different
  // filter, so tracking the prop after mount would only fight the user's edits.
  const initial = untrack(() => filter);

  let kind = $state<FilterKind>(initial?.kind ?? "attribute");
  let column = $state(
    initial && (initial.kind === "attribute" || initial.kind === "numeric") ? initial.column : ""
  );
  let attributeMode = $state<AttributeMode>(
    initial?.kind === "attribute" ? initial.mode : "mandatory"
  );
  let numericMode = $state<NumericMode>(initial?.kind === "numeric" ? initial.mode : "between");
  let timeframeMode = $state<TimeframeMode>(
    initial?.kind === "timeframe" ? initial.mode : "intersects"
  );
  let endpointMode = $state<EndpointMode>(
    initial?.kind === "endpoint" ? initial.mode : "mandatory"
  );
  let endpointPosition = $state<EndpointPosition>(
    initial?.kind === "endpoint" ? initial.position : "start"
  );
  let selected = $state<string[]>(
    initial?.kind === "attribute"
      ? [...initial.values]
      : initial?.kind === "endpoint"
        ? [...initial.activities]
        : []
  );
  let min = $state(initial?.kind === "numeric" && initial.min !== null ? String(initial.min) : "");
  let max = $state(initial?.kind === "numeric" && initial.max !== null ? String(initial.max) : "");
  let from = $state(initial?.kind === "timeframe" ? toDateInput(initial.from) : "");
  let to = $state(initial?.kind === "timeframe" ? toDateInput(initial.to) : "");
  let search = $state("");

  let values = $state<ValueCount[]>([]);
  let truncated = $state(false);
  let valuesError = $state<string | null>(null);

  /** The picker column: endpoint filters always pick from activities. */
  const pickerColumn = $derived(
    kind === "endpoint" ? activityColumn : kind === "attribute" ? column : ""
  );

  // Default the column to the first usable one whenever the kind changes.
  $effect(() => {
    const options = kind === "numeric" ? numericColumns : categorical;
    if ((kind === "attribute" || kind === "numeric") && !options.some((c) => c.name === column)) {
      column = options[0]?.name ?? "";
    }
  });

  $effect(() => {
    const target = pickerColumn;
    if (!target) {
      values = [];
      return;
    }
    let stale = false;
    valuesError = null;
    invoke<{ values: ValueCount[]; truncated: boolean }>("distinct_values", {
      projectId: project.id,
      column: target,
      columns: project.columns,
      limit: VALUE_LIMIT,
      // Endpoint filters only ever match a case's first/last activity, so the
      // picker lists those rather than every activity in the log.
      endpoint: kind === "endpoint" ? endpointPosition : null
    })
      .then((result) => {
        if (stale) return;
        values = result.values;
        truncated = result.truncated;
      })
      .catch((cause) => {
        if (!stale) valuesError = String(cause);
      });
    return () => {
      stale = true;
    };
  });

  const shown = $derived(
    values.filter((v) => v.value.toLowerCase().includes(search.trim().toLowerCase()))
  );

  function toggle(value: string) {
    selected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
  }

  function build(): Filter | null {
    switch (kind) {
      case "attribute":
        return { kind, column, mode: attributeMode, values: [...selected] };
      case "numeric":
        return {
          kind,
          column,
          mode: numericMode,
          min: min.trim() === "" ? null : Number(min),
          max: max.trim() === "" ? null : Number(max)
        };
      case "timeframe": {
        if (!from || !to) return null;
        // The window is inclusive, so `to` covers the whole of its last day.
        return {
          kind,
          mode: timeframeMode,
          from: new Date(`${from}T00:00:00`).getTime(),
          to: new Date(`${to}T23:59:59.999`).getTime()
        };
      }
      case "endpoint":
        return { kind, position: endpointPosition, mode: endpointMode, activities: [...selected] };
    }
  }

  const draft = $derived(build());
  const valid = $derived(draft !== null && isFilterComplete(draft));

  // Live impact of the draft, measured on top of the filters that precede it.
  // Debounced because typing in a range box would otherwise re-scan per keystroke.
  let impact = $state<{ before: ChainStep; after: ChainStep } | null>(null);
  let measuring = $state(false);

  $effect(() => {
    const candidate = valid ? draft : null;
    if (!candidate) {
      impact = null;
      return;
    }

    let stale = false;
    measuring = true;
    const timer = setTimeout(() => {
      chainImpact(project, [...precedingChain, candidate])
        .then((steps) => {
          if (stale) return;
          impact = { before: steps[steps.length - 2], after: steps[steps.length - 1] };
          measuring = false;
        })
        .catch(() => {
          if (!stale) measuring = false;
        });
    }, IMPACT_DEBOUNCE);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  const retainedPct = $derived(
    impact && impact.before.cases > 0
      ? Math.round((impact.after.cases / impact.before.cases) * 100)
      : null
  );

  function save() {
    if (draft && valid) onsave(draft);
  }
</script>

<!-- Declared at the template root: a snippet inside a component would be read
     as one of that component's props rather than a local. -->
{#snippet modes(
  entries: readonly string[],
  current: string,
  info: Record<string, { label: string; description: string }>,
  select: (value: string) => void
)}
  <RadioGroup.Root value={current} onValueChange={select}>
    {#each entries as mode (mode)}
      <Field.Field orientation="horizontal">
        <RadioGroup.Item value={mode} id="mode-{mode}" />
        <Field.FieldContent>
          <Field.FieldLabel for="mode-{mode}">{info[mode].label}</Field.FieldLabel>
          <Field.FieldDescription>{info[mode].description}</Field.FieldDescription>
        </Field.FieldContent>
      </Field.Field>
    {/each}
  </RadioGroup.Root>
{/snippet}

<Field.FieldGroup>
  <Field.Field>
    <Field.FieldLabel>Filter type</Field.FieldLabel>
    <ToggleGroup.Root
      type="single"
      value={kind}
      onValueChange={(next) => {
        if (!next) return;
        kind = next as FilterKind;
        selected = [];
      }}
      variant="outline"
      class="justify-start"
    >
      {#each kinds as option (option.kind)}
        <ToggleGroup.Item value={option.kind}>{option.label}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </Field.Field>

  {#if kind === "attribute" || kind === "numeric"}
    {@const options = kind === "numeric" ? numericColumns : categorical}
    <Field.Field>
      <Field.FieldLabel for="filter-column">Column</Field.FieldLabel>
      <Select.Root
        type="single"
        value={column}
        onValueChange={(next) => {
          column = next;
          selected = [];
        }}
      >
        <Select.Trigger id="filter-column">{column || "Pick a column"}</Select.Trigger>
        <Select.Content>
          <Select.Group>
            {#each options as option (option.name)}
              <Select.Item value={option.name} label={option.name}>{option.name}</Select.Item>
            {/each}
          </Select.Group>
        </Select.Content>
      </Select.Root>
    </Field.Field>
  {/if}

  {#if kind === "endpoint"}
    <Field.Field>
      <Field.FieldLabel>Position</Field.FieldLabel>
      <ToggleGroup.Root
        type="single"
        value={endpointPosition}
        onValueChange={(next) => {
          if (!next) return;
          endpointPosition = next as EndpointPosition;
          // Start and end activities are different sets — a carried-over pick
          // could be one the other position never offers.
          selected = [];
        }}
        variant="outline"
        class="justify-start"
      >
        <ToggleGroup.Item value="start">Starts with</ToggleGroup.Item>
        <ToggleGroup.Item value="end">Ends with</ToggleGroup.Item>
      </ToggleGroup.Root>
    </Field.Field>
  {/if}

  <Field.FieldSet>
    <Field.FieldLegend>Mode</Field.FieldLegend>
    {#if kind === "attribute"}
      {@render modes(
        ATTRIBUTE_MODES,
        attributeMode,
        ATTRIBUTE_MODE_INFO,
        (v) => (attributeMode = v as AttributeMode)
      )}
    {:else if kind === "numeric"}
      {@render modes(
        NUMERIC_MODES,
        numericMode,
        NUMERIC_MODE_INFO,
        (v) => (numericMode = v as NumericMode)
      )}
    {:else if kind === "timeframe"}
      {@render modes(
        TIMEFRAME_MODES,
        timeframeMode,
        TIMEFRAME_MODE_INFO,
        (v) => (timeframeMode = v as TimeframeMode)
      )}
    {:else}
      {@render modes(
        ENDPOINT_MODES,
        endpointMode,
        ENDPOINT_MODE_INFO,
        (v) => (endpointMode = v as EndpointMode)
      )}
    {/if}
  </Field.FieldSet>

  {#if kind === "numeric"}
    <div class="flex gap-3">
      {#if numericMode !== "below"}
        <Field.Field>
          <Field.FieldLabel for="filter-min">
            {numericMode === "above" ? "Value" : "Minimum"}
          </Field.FieldLabel>
          <Input id="filter-min" type="number" bind:value={min} placeholder="—" />
        </Field.Field>
      {/if}
      {#if numericMode !== "above"}
        <Field.Field>
          <Field.FieldLabel for="filter-max">
            {numericMode === "below" ? "Value" : "Maximum"}
          </Field.FieldLabel>
          <Input id="filter-max" type="number" bind:value={max} placeholder="—" />
        </Field.Field>
      {/if}
    </div>
  {:else if kind === "timeframe"}
    <div class="flex gap-3">
      <Field.Field>
        <Field.FieldLabel for="filter-from">From</Field.FieldLabel>
        <Input id="filter-from" type="date" bind:value={from} />
      </Field.Field>
      <Field.Field>
        <Field.FieldLabel for="filter-to">To</Field.FieldLabel>
        <Input id="filter-to" type="date" bind:value={to} />
      </Field.Field>
    </div>
  {:else}
    <Field.Field>
      <div class="flex items-center gap-2">
        <Field.FieldLabel>{kind === "endpoint" ? "Activities" : "Values"}</Field.FieldLabel>
        <span class="text-muted-foreground ml-auto text-xs">
          {selected.length}/{values.length} selected
        </span>
        <Button variant="ghost" size="xs" onclick={() => (selected = shown.map((v) => v.value))}>
          All
        </Button>
        <Button variant="ghost" size="xs" onclick={() => (selected = [])}>None</Button>
      </div>
      {#if values.length > 8}
        <InputGroup.Root>
          <InputGroup.Input placeholder="Search values…" bind:value={search} />
          <InputGroup.Addon>
            <Search />
          </InputGroup.Addon>
        </InputGroup.Root>
      {/if}
      {#if valuesError}
        <Field.FieldError>{valuesError}</Field.FieldError>
      {:else}
        <ScrollArea.Root class="border-border h-56 border">
          {#each shown as option (option.value)}
            <Label
              class="hover:bg-muted flex cursor-pointer items-center gap-2 px-2.5 py-1.5 font-normal"
            >
              <Checkbox
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span class="truncate text-sm">{option.value}</span>
              <span class="text-muted-foreground ml-auto font-mono text-[0.6875rem]">
                {formatNumber(option.cases)}
              </span>
            </Label>
          {:else}
            <p class="text-muted-foreground px-2.5 py-3 text-xs">No matching values.</p>
          {/each}
        </ScrollArea.Root>
        {#if truncated}
          <Field.FieldDescription>
            Showing the {VALUE_LIMIT} most common values of this column.
          </Field.FieldDescription>
        {/if}
      {/if}
    </Field.Field>
  {/if}

  <!-- Only shown once the filter is complete enough to measure — an incomplete
       draft has no impact worth naming. -->
  {#if valid}
    <Field.FieldSeparator />

    <Field.Field>
      <Field.FieldLabel>Impact</Field.FieldLabel>
      {#if measuring || !impact}
        <Skeleton class="h-4 w-48" />
      {:else}
        <Field.FieldDescription>
          Keeps <span class="text-foreground font-mono font-medium">
            {formatNumber(impact.after.cases)}
          </span>
          of {formatNumber(impact.before.cases)} cases
          {#if retainedPct !== null}
            <span class="text-foreground font-medium">({retainedPct}%)</span>
          {/if}
          and {formatNumber(impact.after.events)} of {formatNumber(impact.before.events)} events.
        </Field.FieldDescription>
      {/if}
    </Field.Field>
  {/if}

  <div class="flex justify-end gap-2">
    <Button variant="ghost" onclick={oncancel}>Cancel</Button>
    <Button disabled={!valid} onclick={save}>{filter ? "Save filter" : "Add filter"}</Button>
  </div>
</Field.FieldGroup>

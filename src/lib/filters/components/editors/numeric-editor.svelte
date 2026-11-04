<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import type { Project } from "$lib/event-log/types";
  import { numericPercentiles } from "$lib/filters/invokers/numeric-percentiles";
  import type { Filter } from "$lib/filters/kind/filter";
  import {
    NUMERIC_CASE_MODE_INFO,
    NUMERIC_MODES,
    NUMERIC_MODE_INFO,
    type NumericFilter,
    type NumericMode
  } from "$lib/filters/kind/numeric";
  import { isCaseLevel, numericColumns } from "$lib/filters/utils/columns";
  import { formatNumber } from "$lib/format";
  import ColumnSelect from "../column-select.svelte";
  import ModePicker from "../mode-picker.svelte";
  import PercentileStrip from "../percentile-strip.svelte";

  /**
   * The range a case's value falls in on a numeric column: its one resolved
   * value on a case-level column, any event's otherwise. A null bound is an
   * unbounded side. The bound stays as typed while the field has focus and is
   * drafted, and on commit corrected, to the values `precedingChain` leaves.
   */
  let {
    project,
    initial = null,
    precedingChain = [],
    color,
    ondraft
  }: {
    project: Project;
    initial?: NumericFilter | null;
    precedingChain?: Filter[];
    color: string;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);
  const columns = $derived(numericColumns(project));

  let column = $state(seed?.column ?? "");
  let mode = $state<NumericMode>(seed?.mode ?? "between");
  let min = $state<number | null>(seed?.min ?? null);
  let max = $state<number | null>(seed?.max ?? null);

  let load = $state<
    | { status: "loading" }
    | { status: "ready"; points: number[] }
    | { status: "failed"; message: string }
  >({ status: "loading" });
  const points = $derived(load.status === "ready" ? load.points : []);
  const range = $derived(
    points.length > 0 ? { min: points[0], max: points[points.length - 1] } : null
  );

  const caseLevel = $derived(isCaseLevel(project, column));
  const integer = $derived(columns.find((c) => c.name === column)?.type === "integer");

  // Default to the first usable column, and recover if the one in hand goes.
  $effect(() => {
    if (!columns.some((c) => c.name === column)) column = columns[0]?.name ?? "";
  });

  $effect(() => {
    if (!column) return;
    let stale = false;
    load = { status: "loading" };
    numericPercentiles(project, column, precedingChain)
      .then((result) => {
        if (!stale) load = { status: "ready", points: result };
      })
      .catch((cause) => {
        if (!stale) load = { status: "failed", message: String(cause) };
      });
    return () => {
      stale = true;
    };
  });

  function bounded(value: number | null): number | null {
    if (value === null || !range) return value;
    return Math.min(Math.max(value, range.min), range.max);
  }

  const usesMin = $derived(mode !== "below");
  const usesMax = $derived(mode !== "above");
  const inverted = $derived(usesMin && usesMax && min !== null && max !== null && min > max);
  const outOfRange = $derived(
    (usesMin && bounded(min) !== min) || (usesMax && bounded(max) !== max)
  );

  function commit() {
    min = bounded(min);
    max = bounded(max);
  }

  $effect(() => {
    ondraft(
      load.status === "loading" || inverted
        ? null
        : { kind: "numeric", column, mode, min: bounded(min), max: bounded(max) }
    );
  });
</script>

<ColumnSelect
  {columns}
  value={column}
  onselect={(next) => {
    column = next;
    min = null;
    max = null;
  }}
  {color}
  class="w-1/2"
/>

<div class="grid gap-6 sm:grid-cols-2">
  <ModePicker
    entries={NUMERIC_MODES}
    current={mode}
    info={caseLevel ? NUMERIC_CASE_MODE_INFO : NUMERIC_MODE_INFO}
    onselect={(v) => (mode = v)}
  />

  <div class="flex flex-col items-center justify-center gap-2">
    <div class="flex w-full justify-center gap-3">
      {#if usesMin}
        <Field.Field class="max-w-64 flex-1">
          <Field.FieldLabel for="filter-min" class="justify-center">
            {mode === "above" ? "Value" : "Minimum"}
          </Field.FieldLabel>
          <Input
            id="filter-min"
            type="number"
            min={range?.min}
            max={range?.max}
            step={integer ? 1 : "any"}
            bind:value={min}
            onchange={commit}
            placeholder="—"
            class="h-14 text-center font-mono text-2xl md:text-2xl"
          />
        </Field.Field>
      {/if}
      {#if usesMax}
        <Field.Field class="max-w-64 flex-1">
          <Field.FieldLabel for="filter-max" class="justify-center">
            {mode === "below" ? "Value" : "Maximum"}
          </Field.FieldLabel>
          <Input
            id="filter-max"
            type="number"
            min={range?.min}
            max={range?.max}
            step={integer ? 1 : "any"}
            bind:value={max}
            onchange={commit}
            placeholder="—"
            class="h-14 text-center font-mono text-2xl md:text-2xl"
          />
        </Field.Field>
      {/if}
    </div>

    {#if range}
      <Field.FieldDescription class="text-center">
        From {formatNumber(range.min)} to {formatNumber(range.max)}
      </Field.FieldDescription>
    {/if}
    {#if inverted}
      <Field.FieldError class="text-center">Minimum has to be lower than Maximum.</Field.FieldError>
    {:else if outOfRange}
      <Field.FieldDescription class="text-center">
        Outside the data, so the filter uses the nearest value.
      </Field.FieldDescription>
    {/if}
  </div>
</div>

{#if load.status === "loading"}
  <Skeleton class="h-24 w-full" />
{:else if load.status === "failed"}
  <p class="text-destructive text-xs">{load.message}</p>
{:else if range}
  <PercentileStrip
    {points}
    {mode}
    min={bounded(min)}
    max={bounded(max)}
    {color}
    unit={caseLevel ? "cases" : "events"}
  />
{:else}
  <p class="text-muted-foreground text-xs">No values in this column.</p>
{/if}

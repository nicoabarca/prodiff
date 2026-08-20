<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import {
    NUMERIC_MODES,
    NUMERIC_MODE_INFO,
    type NumericFilter,
    type NumericMode
  } from "$lib/filters/kind/numeric";
  import { numericColumns } from "$lib/filters/utils/columns";
  import ColumnSelect from "../column-select.svelte";
  import ModePicker from "../mode-picker.svelte";

  /**
   * The range a case's events cover in a numeric column. Bounds are kept as
   * typed text so a half-entered number stays on screen; an empty box is an
   * unbounded side, which is what `null` means to the filter.
   */
  let {
    project,
    initial = null,
    color,
    ondraft
  }: {
    project: Project;
    initial?: NumericFilter | null;
    color: string;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);
  const columns = $derived(numericColumns(project));

  let column = $state(seed?.column ?? "");
  let mode = $state<NumericMode>(seed?.mode ?? "between");
  let min = $state(seed?.min != null ? String(seed.min) : "");
  let max = $state(seed?.max != null ? String(seed.max) : "");

  // Default to the first usable column, and recover if the one in hand goes.
  $effect(() => {
    if (!columns.some((c) => c.name === column)) column = columns[0]?.name ?? "";
  });

  $effect(() => {
    ondraft({
      kind: "numeric",
      column,
      mode,
      min: min.trim() === "" ? null : Number(min),
      max: max.trim() === "" ? null : Number(max)
    });
  });
</script>

<ColumnSelect {columns} value={column} onselect={(next) => (column = next)} {color} class="w-1/2" />

<ModePicker
  entries={NUMERIC_MODES}
  current={mode}
  info={NUMERIC_MODE_INFO}
  onselect={(v) => (mode = v)}
/>

<div class="flex w-1/2 gap-3">
  {#if mode !== "below"}
    <Field.Field>
      <Field.FieldLabel for="filter-min">
        {mode === "above" ? "Value" : "Minimum"}
      </Field.FieldLabel>
      <Input id="filter-min" type="number" bind:value={min} placeholder="—" />
    </Field.Field>
  {/if}
  {#if mode !== "above"}
    <Field.Field>
      <Field.FieldLabel for="filter-max">
        {mode === "below" ? "Value" : "Maximum"}
      </Field.FieldLabel>
      <Input id="filter-max" type="number" bind:value={max} placeholder="—" />
    </Field.Field>
  {/if}
</div>

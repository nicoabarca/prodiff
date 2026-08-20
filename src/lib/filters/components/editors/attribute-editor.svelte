<script lang="ts">
  import { untrack } from "svelte";
  import type { Project } from "$lib/event-log/types";
  import {
    ATTRIBUTE_MODES,
    ATTRIBUTE_MODE_INFO,
    type AttributeFilter,
    type AttributeMode
  } from "$lib/filters/kind/attribute";
  import type { Filter } from "$lib/filters/kind/filter";
  import { columnValues, VALUE_LIMIT } from "$lib/filters/state/distinct-values.svelte";
  import { categoricalColumns } from "$lib/filters/utils/columns";
  import ColumnSelect from "../column-select.svelte";
  import ModePicker from "../mode-picker.svelte";
  import ValuePicker from "../value-picker.svelte";

  /** The values a case's events hold in a categorical column. */
  let {
    project,
    initial = null,
    color,
    ondraft
  }: {
    project: Project;
    initial?: AttributeFilter | null;
    color: string;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);
  const columns = $derived(categoricalColumns(project));

  let column = $state(seed?.column ?? "");
  let mode = $state<AttributeMode>(seed?.mode ?? "mandatory");
  let selected = $state<string[]>(seed ? [...seed.values] : []);

  $effect(() => {
    if (!columns.some((c) => c.name === column)) column = columns[0]?.name ?? "";
  });

  const values = columnValues(
    () => project,
    () => column
  );

  $effect(() => {
    ondraft({ kind: "attribute", column, mode, values: [...selected] });
  });
</script>

<!-- Column and Mode share the left column; the value picker takes the right
     one, so picking values no longer waits at the bottom. -->
<div class="grid gap-3 sm:grid-cols-2">
  <div class="space-y-3">
    <ColumnSelect
      {columns}
      value={column}
      onselect={(next) => {
        column = next;
        selected = [];
      }}
      {color}
      labelClass="h-6 items-center"
    />
    <ModePicker
      entries={ATTRIBUTE_MODES}
      current={mode}
      info={ATTRIBUTE_MODE_INFO}
      onselect={(v) => (mode = v)}
    />
  </div>
  <div>
    <ValuePicker
      label="Values"
      options={values.values}
      chosen={selected}
      onchoose={(next) => (selected = next)}
      truncated={values.truncated}
      error={values.error}
      limit={VALUE_LIMIT}
    />
  </div>
</div>

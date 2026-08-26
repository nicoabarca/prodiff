<script lang="ts">
  import { untrack } from "svelte";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/kind/filter";
  import {
    FOLLOWER_MODES,
    FOLLOWER_MODE_INFO,
    type FollowerFilter,
    type FollowerMode
  } from "$lib/filters/kind/follower";
  import { columnValues, VALUE_LIMIT } from "$lib/filters/state/distinct-values.svelte";
  import { eventLevelColumns } from "$lib/filters/utils/columns";
  import ColumnSelect from "../column-select.svelte";
  import ModePicker from "../mode-picker.svelte";
  import ValuePicker from "../value-picker.svelte";

  /**
   * One column read twice: a case matches when an event holding a reference
   * value is followed by one holding a follower value. Both pickers list the
   * same column, so a single fetch feeds them.
   */
  let {
    project,
    initial = null,
    color,
    ondraft
  }: {
    project: Project;
    initial?: FollowerFilter | null;
    color: string;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);
  const columns = $derived(eventLevelColumns(project));

  let column = $state(seed?.column ?? "");
  let mode = $state<FollowerMode>(seed?.mode ?? "eventually");
  let reference = $state<string[]>(seed ? [...seed.reference] : []);
  let follower = $state<string[]>(seed ? [...seed.follower] : []);

  $effect(() => {
    if (!columns.some((c) => c.name === column)) column = columns[0]?.name ?? "";
  });

  const values = columnValues(
    () => project,
    () => column
  );

  $effect(() => {
    ondraft({
      kind: "follower",
      column,
      mode,
      reference: [...reference],
      follower: [...follower]
    });
  });
</script>

<ColumnSelect
  {columns}
  value={column}
  onselect={(next) => {
    column = next;
    reference = [];
    follower = [];
  }}
  {color}
  label="Filter by"
  class="w-1/2"
/>

<ModePicker
  entries={FOLLOWER_MODES}
  current={mode}
  info={FOLLOWER_MODE_INFO}
  onselect={(v) => (mode = v)}
/>

<div class="grid gap-3 sm:grid-cols-2">
  <div class="border-border border p-2">
    <ValuePicker
      label="Reference values"
      options={values.values}
      chosen={reference}
      onchoose={(next) => (reference = next)}
      truncated={values.truncated}
      error={values.error}
      limit={VALUE_LIMIT}
    />
  </div>
  <div class="border-border border p-2">
    <ValuePicker
      label="Follower values"
      options={values.values}
      chosen={follower}
      onchoose={(next) => (follower = next)}
      truncated={values.truncated}
      error={values.error}
      limit={VALUE_LIMIT}
    />
  </div>
</div>

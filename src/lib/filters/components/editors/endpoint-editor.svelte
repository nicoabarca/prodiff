<script lang="ts">
  import { untrack } from "svelte";
  import type { Project } from "$lib/event-log/types";
  import {
    ENDPOINT_MODES,
    ENDPOINT_MODE_INFO,
    type EndpointFilter,
    type EndpointMode,
    type EndpointPosition
  } from "$lib/filters/kind/endpoint";
  import type { Filter } from "$lib/filters/kind/filter";
  import { columnValues, VALUE_LIMIT } from "$lib/filters/state/distinct-values.svelte";
  import { activityColumn } from "$lib/filters/utils/columns";
  import ModePicker from "../mode-picker.svelte";
  import ValuePicker from "../value-picker.svelte";

  /**
   * The activity a case starts or ends with. A case can only start or end with
   * a value, never both, so one filter carries one position and the two lists
   * share a single selection: checking a box in either switches the position.
   */
  let {
    project,
    initial = null,
    ondraft
  }: {
    project: Project;
    initial?: EndpointFilter | null;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);
  const activity = $derived(activityColumn(project));

  let mode = $state<EndpointMode>(seed?.mode ?? "mandatory");
  let position = $state<EndpointPosition>(seed?.position ?? "start");
  let selected = $state<string[]>(seed ? [...seed.activities] : []);

  const startActivities = columnValues(
    () => project,
    () => activity,
    () => "start"
  );
  const endActivities = columnValues(
    () => project,
    () => activity,
    () => "end"
  );

  const startChosen = $derived(position === "start" ? selected : []);
  const endChosen = $derived(position === "end" ? selected : []);

  function choose(next: string[], at: EndpointPosition) {
    position = at;
    selected = next;
  }

  $effect(() => {
    ondraft({ kind: "endpoint", position, mode, activities: [...selected] });
  });
</script>

<ModePicker
  entries={ENDPOINT_MODES}
  current={mode}
  info={ENDPOINT_MODE_INFO}
  onselect={(v) => (mode = v)}
/>

<div class="grid gap-3 sm:grid-cols-2">
  <div class="border-border border p-2">
    <ValuePicker
      label="Starts with"
      options={startActivities.values}
      chosen={startChosen}
      onchoose={(next) => choose(next, "start")}
      truncated={startActivities.truncated}
      error={startActivities.error}
      limit={VALUE_LIMIT}
      labelClass="text-sm font-semibold text-foreground"
    />
  </div>
  <div class="border-border border p-2">
    <ValuePicker
      label="Ends with"
      options={endActivities.values}
      chosen={endChosen}
      onchoose={(next) => choose(next, "end")}
      truncated={endActivities.truncated}
      error={endActivities.error}
      limit={VALUE_LIMIT}
      labelClass="text-sm font-semibold text-foreground"
    />
  </div>
</div>

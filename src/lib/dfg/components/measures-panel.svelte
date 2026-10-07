<script lang="ts">
  /**
   * Every measure the build holds, one row per activity drawn. The graph paints
   * one of them as shade; the rest are read here, each with the change between
   * the Groups and the Significance Test behind it.
   *
   * A row and its node point at each other: hovering either lights both, and
   * picking a row selects the activity.
   */
  import AttributeName from "$lib/custom-attributes/components/attribute-name.svelte";
  import AttributesList from "$lib/custom-attributes/components/attributes-list.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { ACTIVITY_DURATION, attributeOptions } from "$lib/analysis/attributes";
  import { formatSigned } from "$lib/analysis/utils/change";
  import { customColumns } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import PanelResizer from "$lib/dfg/components/panel-resizer.svelte";
  import RampPicker from "$lib/dfg/components/ramp-picker.svelte";
  import type { ResponseDfg } from "$lib/dfg/invokers/types";
  import {
    selection,
    testedAttributes,
    toggleAttribute,
    toggleTested
  } from "$lib/dfg/state/dfg.svelte";
  import {
    hovered,
    selected,
    setEdgeLabels,
    setEdgeMeasure,
    setMeasure,
    setRamp,
    view
  } from "$lib/dfg/state/view.svelte";
  import type { FaceGroup, Measure } from "$lib/dfg/types";
  import {
    CASES,
    formatMeasure,
    measureFromKey,
    measureKey,
    measureLabel
  } from "$lib/dfg/utils/measure";
  import {
    ACTIVITY_KEY,
    DELTA_KEY,
    measureRange,
    measureRows,
    sortRows,
    type Sort
  } from "$lib/dfg/utils/rows";
  import type { Simplified } from "$lib/dfg/utils/simplify";
  import type { Project } from "$lib/event-log/types";
  import { keptRamp, rampsFor } from "$lib/groups/utils/shade";
  import { effectStep } from "$lib/tree/utils/effect";
  import { testLine } from "$lib/tree/utils/verdict";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import FlaskConical from "@lucide/svelte/icons/flask-conical";
  import Triangle from "@lucide/svelte/icons/triangle";
  import X from "@lucide/svelte/icons/x";

  const NOTE =
    "Each attribute is corrected within its own family, so adding one never weakens the findings of another. Unselected attributes are never tested. The graph rebuilds on each change.";

  let {
    project,
    graph,
    simplified,
    groups,
    measures,
    width = $bindable(28),
    onClose,
    onDetails
  }: {
    project: Project;
    graph: ResponseDfg;
    simplified: Simplified;
    groups: FaceGroup[];
    measures: Measure[];
    width?: number;
    onClose: () => void;
    onDetails: () => void;
  } = $props();

  let sort = $state<Sort>({ key: measureKey(view.measure), direction: "desc" });
  /** The measure Δ reports on: the column last sorted by, else what is painted. */
  let subject = $state<string | null>(null);

  const painted = $derived(measureKey(view.measure));
  const deltaKey = $derived(subject ?? painted);
  const deltaLabel = $derived(measureLabel(measureFromKey(deltaKey, measures)));
  const pair = $derived(groups.length === 2);

  const measured = $derived(new Map(graph.nodes.map((node) => [node.id, node])));
  const rows = $derived(
    sortRows(measureRows(simplified.nodes, measured, groups, measures), sort, deltaKey)
  );
  const chosen = $derived(rows.find((row) => row.id === selected.id) ?? null);
  const range = $derived(measureRange(rows, painted));
  const lowHigh = $derived(
    range
      ? [formatMeasure(range[0], view.measure) ?? "—", formatMeasure(range[1], view.measure) ?? "—"]
      : ["—", "—"]
  );
  const attributes = $derived(
    attributeOptions(project.columns, project.hiddenColumns, customColumns(project))
  );
  /** Service Time needs a start timestamp, so a log without one has no time view. */
  const timeAvailable = $derived(
    attributeOptions(project.columns, project.hiddenColumns).includes(ACTIVITY_DURATION)
  );
  const onTime = $derived(
    view.measure.kind === "attribute" &&
      view.measure.name === ACTIVITY_DURATION &&
      view.edge === "wait"
  );
  const onFrequency = $derived(view.measure.kind !== "attribute" && view.edge === "frequency");
  const ramps = $derived(rampsFor(groups.map((group) => group.color)));

  // A comparison that claims the ramp's hue takes it off the grid, so the graph
  // falls back to reading each node in its own Group's colour.
  $effect(() => {
    const kept = keptRamp(view.ramp, ramps);
    if (kept !== view.ramp) setRamp(kept);
  });

  /**
   * The two views every process map offers. Time asks for Service Time if the
   * build was not already measuring it, which rebuilds the graph.
   */
  function showFrequency() {
    setMeasure(CASES);
    setEdgeMeasure("frequency");
  }

  function showTime() {
    if (!selection.attributes.includes(ACTIVITY_DURATION)) {
      toggleAttribute(ACTIVITY_DURATION, true);
    }
    setMeasure({ kind: "attribute", name: ACTIVITY_DURATION });
    setEdgeMeasure("wait");
    setEdgeLabels(true);
  }

  const CAPTION =
    "text-muted-foreground shrink-0 text-[0.625rem] font-bold tracking-[0.06em] uppercase";

  function sortOn(key: string) {
    if (key !== ACTIVITY_KEY && key !== DELTA_KEY) subject = key;
    sort =
      sort.key === key
        ? { key, direction: sort.direction === "desc" ? "asc" : "desc" }
        : { key, direction: key === ACTIVITY_KEY ? "asc" : "desc" };
  }
</script>

<div class="relative flex h-full min-h-0 flex-col" data-tour="dfg-measures-panel">
  <PanelResizer bind:width label="Resize the measures panel" />

  <div class="border-border flex shrink-0 flex-col gap-2.5 border-b px-3.5 py-3">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold">Measures by activity</h2>
      <span class="text-muted-foreground font-mono text-[0.625rem]">
        {rows.length} activities · {groups.length}
        {groups.length === 1 ? "group" : "groups"}
      </span>
      <Button variant="ghost" size="icon" class="ml-auto size-6" onclick={onClose}>
        <X />
        <span class="sr-only">Close measures</span>
      </Button>
    </div>

    <div class="flex items-center gap-2">
      <span class={CAPTION}>Show</span>
      <ToggleGroup.Root
        type="single"
        size="sm"
        variant="outline"
        value={onTime ? "time" : onFrequency ? "frequency" : ""}
        onValueChange={(value) => {
          if (value === "time") showTime();
          else if (value === "frequency") showFrequency();
        }}
      >
        <ToggleGroup.Item value="frequency" class="h-7 text-xs">Frequency</ToggleGroup.Item>
        <ToggleGroup.Item value="time" class="h-7 text-xs" disabled={!timeAvailable}>
          Time
        </ToggleGroup.Item>
      </ToggleGroup.Root>
      <Popover.Root>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="ml-auto shrink-0">
              <FlaskConical data-icon="inline-start" />
              {testedAttributes().length}
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-80" align="end">
          <AttributesList
            options={attributes}
            selected={testedAttributes()}
            note={NOTE}
            onToggle={toggleTested}
          />
        </Popover.Content>
      </Popover.Root>
    </div>

    <div class="flex items-center gap-2">
      <span class={CAPTION}>Graph paints</span>
      <Select.Root
        type="single"
        value={painted}
        onValueChange={(key) => setMeasure(measureFromKey(key, measures))}
      >
        <Select.Trigger size="sm" class="min-w-0 flex-1">
          {measureLabel(view.measure)}
        </Select.Trigger>
        <Select.Content>
          {#each measures as measure (measureKey(measure))}
            <Select.Item value={measureKey(measure)} label={measureLabel(measure)}>
              {#if measure.kind === "attribute"}
                <AttributeName name={measure.name} />
              {:else}
                {measureLabel(measure)}
              {/if}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <RampPicker
        low={lowHigh[0]}
        high={lowHigh[1]}
        value={view.ramp}
        options={ramps}
        onSelect={setRamp}
      />
    </div>
  </div>

  {#if chosen}
    <div class="border-border flex shrink-0 items-center gap-2 border-b px-3.5 py-1.5">
      <span class="bg-ring size-1.5 shrink-0 rounded-full" aria-hidden="true"></span>
      <span class="min-w-0 truncate text-xs font-medium">{chosen.label}</span>
      <span class="text-muted-foreground shrink-0 text-[0.625rem]">selected on the graph</span>
      <Button variant="outline" size="sm" class="ml-auto h-6 shrink-0" onclick={onDetails}>
        Open detail
      </Button>
    </div>
  {/if}

  {#if measures.length === 2}
    <p class="text-muted-foreground border-border shrink-0 border-b px-3.5 py-2 text-[0.625rem]">
      Counts are all this graph measured. Add attributes above to read Service Time, Waiting Time or
      a column of your own here.
    </p>
  {/if}

  {#snippet head(key: string, label: string, column: string)}
    <button
      type="button"
      class="hover:text-foreground flex shrink-0 cursor-pointer items-center gap-1 {column} {key ===
      ACTIVITY_KEY
        ? 'justify-start'
        : 'justify-end'}"
      onclick={() => sortOn(key)}
    >
      {#if key === DELTA_KEY}
        <Triangle class="size-2.5 shrink-0" />
      {/if}
      <span class="truncate">{label}</span>
      {#if sort.key === key}
        {#if sort.direction === "asc"}
          <ArrowUp class="size-2.5 shrink-0" />
        {:else}
          <ArrowDown class="size-2.5 shrink-0" />
        {/if}
      {/if}
    </button>
  {/snippet}

  <div class="min-h-0 flex-1 overflow-auto">
    <div class="min-w-max">
      <div
        class="bg-sidebar border-border text-muted-foreground sticky top-0 z-10 flex items-center gap-2.5 border-b px-3.5 py-1.5 text-[0.625rem] font-bold tracking-[0.06em] uppercase"
      >
        {@render head(ACTIVITY_KEY, "Activity", "w-36")}
        {#each measures as measure (measureKey(measure))}
          {@render head(measureKey(measure), measureLabel(measure), "w-20")}
        {/each}
        {#if pair}
          {@render head(DELTA_KEY, deltaLabel, "w-24")}
        {/if}
      </div>

      {#each rows as row (row.id)}
        {@const lit = hovered.id === row.id || selected.id === row.id}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="border-border flex cursor-pointer items-start gap-2.5 border-b px-3.5 py-1.5 {lit
            ? 'bg-accent'
            : ''}"
          onmouseenter={() => (hovered.id = row.id)}
          onmouseleave={() => (hovered.id = null)}
          onclick={() => (selected.id = row.id)}
        >
          <span class="w-36 shrink-0 truncate text-xs font-medium" title={row.label}>
            {row.label}
          </span>
          {#each measures as measure (measureKey(measure))}
            {@const cell = row.cells[measureKey(measure)]}
            <span class="flex w-20 shrink-0 flex-col items-end gap-0.5 font-mono text-[0.6875rem]">
              {#each groups as group (group.id)}
                <span style="color:var(--{group.color})">
                  {formatMeasure(cell?.values[group.id] ?? null, measure) ?? "—"}
                </span>
              {/each}
            </span>
          {/each}
          {#if pair}
            {@const cell = row.cells[deltaKey]}
            {@const step = cell?.test?.significant ? effectStep(cell.test.effectSize) : null}
            <Tooltip.Root>
              <Tooltip.Trigger
                class="w-24 shrink-0 text-right font-mono text-[0.6875rem] {step
                  ? 'bg-(--fill) text-(--ink)'
                  : 'text-muted-foreground'}"
                style={step
                  ? `--fill:var(--effect-${step});--ink:var(--effect-${step}-foreground)`
                  : ""}
              >
                {formatSigned(cell?.delta ?? null, 0, "%")}
              </Tooltip.Trigger>
              <Tooltip.Content class="max-w-64 text-[0.6875rem]">
                {groups[1].name} against {groups[0].name} on {deltaLabel}.
                {#if cell?.test}
                  {testLine(cell.test, groups)}
                {:else}
                  A count carries no Significance Test.
                {/if}
              </Tooltip.Content>
            </Tooltip.Root>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div
    class="text-muted-foreground border-border flex shrink-0 flex-col gap-1 border-t px-3.5 py-2 text-[0.625rem]"
  >
    {#if pair}
      <p>
        Δ is {groups[1].name} against {groups[0].name} on {deltaLabel}, the column the table is
        sorted by. Sort on Δ itself to rank by the size of the difference. A cell is shaded on the
        effect ramp where the Significance Test found the difference real.
      </p>
    {/if}
    <p>
      Counts follow the sliders. An attribute's figures are its mean over every variant the graph
      was built from, so they stand still while the sliders move.
    </p>
  </div>
</div>

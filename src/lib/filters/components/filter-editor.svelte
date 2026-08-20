<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    ATTRIBUTE_MODES,
    ATTRIBUTE_MODE_INFO,
    type AttributeMode
  } from "$lib/filters/filters/attribute";
  import {
    ENDPOINT_MODES,
    ENDPOINT_MODE_INFO,
    type EndpointMode,
    type EndpointPosition
  } from "$lib/filters/filters/endpoint";
  import { isFilterComplete, type Filter, type FilterKind } from "$lib/filters/filters/filter";
  import { distinctValues } from "$lib/filters/invokers/distinct-values";
  import {
    FOLLOWER_MODES,
    FOLLOWER_MODE_INFO,
    type FollowerMode
  } from "$lib/filters/filters/follower";
  import { NUMERIC_MODES, NUMERIC_MODE_INFO, type NumericMode } from "$lib/filters/filters/numeric";
  import {
    TIMEFRAME_MODES,
    TIMEFRAME_MODE_INFO,
    type TimeframeMode
  } from "$lib/filters/filters/timeframe";
  import {
    activityColumn,
    categoricalColumns,
    eventLevelColumns,
    numericColumns
  } from "$lib/filters/utils/columns";
  import { chainImpact } from "$lib/slices/invokers/chain-impact";
  import type { ResponseChainStep } from "$lib/slices/invokers/types";
  import { formatDay, formatDuration, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import ModePicker from "./mode-picker.svelte";
  import ValuePicker from "./value-picker.svelte";
  import DurationHistogram from "./duration-histogram.svelte";
  import TimeframePicker from "./timeframe-picker.svelte";

  let {
    project,
    filter = null,
    /** Filters applied before this one — the draft's impact is measured on top of them. */
    precedingChain = [],
    /** The accent of the slice being edited, so its charts read as that population. */
    color = "var(--slice-base)",
    onsave,
    oncancel
  }: {
    project: Project;
    filter?: Filter | null;
    precedingChain?: Filter[];
    color?: string;
    onsave: (filter: Filter) => void;
    oncancel: () => void;
  } = $props();

  /** Distinct values shown in the picker before it truncates. */
  const VALUE_LIMIT = 500;
  const DAY_MS = 86_400_000;
  /** Debounce before re-measuring the draft against the log, in ms. */
  const IMPACT_DEBOUNCE = 250;

  const activity = $derived(activityColumn(project));
  const categorical = $derived(categoricalColumns(project));
  const numeric = $derived(numericColumns(project));
  const eventLevel = $derived(eventLevelColumns(project));

  const kinds = $derived(
    [
      {
        kind: "attribute" as const,
        label: "Attribute",
        description: "Selects cases by the values their events hold in a categorical column.",
        available: categorical.length > 0
      },
      {
        kind: "numeric" as const,
        label: "Numeric",
        description: "Selects cases by the range their events cover in a numeric column.",
        available: numeric.length > 0
      },
      {
        kind: "timeframe" as const,
        label: "Timeframe",
        description: "Selects cases by how they overlap a window of time.",
        available: true
      },
      {
        kind: "endpoint" as const,
        label: "Start / end",
        description: "Selects cases by the activity they start or end with.",
        available: activity !== ""
      },
      {
        kind: "duration" as const,
        label: "Duration",
        description: "Selects cases by how long they run, first event to last.",
        available: true
      },
      {
        kind: "follower" as const,
        label: "Follows",
        description: "Selects cases where one value is followed by another in the same column.",
        available: eventLevel.length > 0
      }
    ].filter((k) => k.available)
  );

  // The form is seeded from the filter being edited and then owns its own
  // state. Callers remount the editor (via `{#key}`) to point it at a different
  // filter, so tracking the prop after mount would only fight the user's edits.
  const initial = untrack(() => filter);

  let kind = $state<FilterKind>(initial?.kind ?? "attribute");
  let column = $state(
    initial &&
      (initial.kind === "attribute" || initial.kind === "numeric" || initial.kind === "follower")
      ? initial.column
      : ""
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
  // Day-aligned epoch milliseconds, the same figures the filter carries: the
  // picker brushes them off the daily case load and shows them on a calendar.
  let from = $state<number | null>(initial?.kind === "timeframe" ? initial.from : null);
  let to = $state<number | null>(initial?.kind === "timeframe" ? initial.to : null);
  let durationMode = $state<NumericMode>(initial?.kind === "duration" ? initial.mode : "between");
  // The filter's bounds are days; the histogram brushes them in milliseconds,
  // which is also the unit every duration is displayed in.
  let durationMinMs = $state(
    initial?.kind === "duration" && initial.min !== null ? initial.min * DAY_MS : null
  );
  let durationMaxMs = $state(
    initial?.kind === "duration" && initial.max !== null ? initial.max * DAY_MS : null
  );
  let followerMode = $state<FollowerMode>(
    initial?.kind === "follower" ? initial.mode : "eventually"
  );
  let referenceValues = $state<string[]>(
    initial?.kind === "follower" ? [...initial.reference] : []
  );
  let followerValues = $state<string[]>(initial?.kind === "follower" ? [...initial.follower] : []);

  let values = $state<string[]>([]);
  let truncated = $state(false);
  let valuesError = $state<string | null>(null);

  // Endpoint filters show both positions' activities at once — see the two
  // separate value pickers below — so they get their own pair of lists
  // instead of sharing the single-column fetch above.
  let startValues = $state<string[]>([]);
  let startTruncated = $state(false);
  let startValuesError = $state<string | null>(null);
  let endValues = $state<string[]>([]);
  let endTruncated = $state(false);
  let endValuesError = $state<string | null>(null);

  // A case can only start or end with a value, not both, so the two pickers
  // share one selection: whichever list the user last checked a box in wins.
  const startChosen = $derived(endpointPosition === "start" ? selected : []);
  const endChosen = $derived(endpointPosition === "end" ? selected : []);
  function chooseStart(next: string[]) {
    endpointPosition = "start";
    selected = next;
  }
  function chooseEnd(next: string[]) {
    endpointPosition = "end";
    selected = next;
  }

  /** The columns a kind may read, and which one its value picker lists. */
  const columnOptions = $derived(
    kind === "numeric" ? numeric : kind === "follower" ? eventLevel : categorical
  );
  const picksColumn = $derived(kind === "attribute" || kind === "numeric" || kind === "follower");

  /** The picker column for the single-list kinds (attribute, follower). */
  const pickerColumn = $derived(kind === "attribute" || kind === "follower" ? column : "");

  // Default the column to the first usable one whenever the kind changes.
  $effect(() => {
    if (picksColumn && !columnOptions.some((c) => c.name === column)) {
      column = columnOptions[0]?.name ?? "";
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
    distinctValues(project.id, target, project.columns, VALUE_LIMIT)
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

  // Both positions are fetched together whenever the endpoint kind is active,
  // so the two pickers can show start and end activities side by side.
  $effect(() => {
    if (kind !== "endpoint" || !activity) {
      startValues = [];
      endValues = [];
      return;
    }
    let stale = false;
    startValuesError = null;
    endValuesError = null;

    const fetch = (position: EndpointPosition) =>
      distinctValues(project.id, activity, project.columns, VALUE_LIMIT, position);

    fetch("start")
      .then((result) => {
        if (stale) return;
        startValues = result.values;
        startTruncated = result.truncated;
      })
      .catch((cause) => {
        if (!stale) startValuesError = String(cause);
      });

    fetch("end")
      .then((result) => {
        if (stale) return;
        endValues = result.values;
        endTruncated = result.truncated;
      })
      .catch((cause) => {
        if (!stale) endValuesError = String(cause);
      });

    return () => {
      stale = true;
    };
  });

  const timeframeSummary = $derived(
    from === null || to === null ? "Nothing selected" : `${formatDay(from)} → ${formatDay(to)}`
  );

  /** The brushed range as the predicate it actually stands for. */
  const durationSummary = $derived.by(() => {
    if (durationMinMs === null && durationMaxMs === null) return "Nothing selected";
    const low = formatDuration(durationMinMs);
    const high = formatDuration(durationMaxMs);
    switch (durationMode) {
      case "above":
        return `≥ ${low}`;
      case "below":
        return `≤ ${high}`;
      case "between":
        return `${low} – ${high}`;
      case "outside":
        return `< ${low} or > ${high}`;
    }
  });

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
        if (from === null || to === null) return null;
        // The picker already hands over an inclusive window: `from` at midnight
        // and `to` at the last millisecond of its day.
        return { kind, mode: timeframeMode, from, to };
      }
      case "endpoint":
        return { kind, position: endpointPosition, mode: endpointMode, activities: [...selected] };
      case "follower":
        return {
          kind,
          column,
          mode: followerMode,
          reference: [...referenceValues],
          follower: [...followerValues]
        };
      case "duration":
        return {
          kind,
          mode: durationMode,
          min: durationMinMs === null ? null : durationMinMs / DAY_MS,
          max: durationMaxMs === null ? null : durationMaxMs / DAY_MS
        };
    }
  }

  const draft = $derived(build());
  const valid = $derived(draft !== null && isFilterComplete(draft));

  // Live impact of the draft, measured on top of the filters that precede it.
  // Debounced because typing in a range box would otherwise re-scan per keystroke.
  let impact = $state<{ before: ResponseChainStep; after: ResponseChainStep } | null>(null);
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

<Field.FieldGroup style="--accent-color: {color}">
  <Field.Field>
    <Field.FieldLabel>Filter type</Field.FieldLabel>
    <ToggleGroup.Root
      type="single"
      value={kind}
      onValueChange={(next) => {
        if (!next) return;
        kind = next as FilterKind;
        selected = [];
        referenceValues = [];
        followerValues = [];
      }}
      variant="outline"
      spacing={1}
      class="grid w-full grid-cols-5"
    >
      {#each kinds as option (option.kind)}
        <ToggleGroup.Item
          value={option.kind}
          class="data-[state=on]:text-background data-[state=on]:border-(--accent-color) data-[state=on]:bg-(--accent-color) data-[state=on]:hover:bg-(--accent-color)"
        >
          {option.label}
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
    <Field.FieldDescription>
      {kinds.find((k) => k.kind === kind)?.description}
    </Field.FieldDescription>
  </Field.Field>

  {#if kind === "attribute"}
    <!-- Column and Mode share the left column; the value picker takes the
         right one, so picking values no longer waits at the bottom. -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-3">
        <Field.Field>
          <Field.FieldLabel for="filter-column" class="h-6 items-center">Column</Field.FieldLabel>
          <Select.Root
            type="single"
            value={column}
            onValueChange={(next) => {
              column = next;
              selected = [];
            }}
          >
            <Select.Trigger id="filter-column">{column || "Pick a column"}</Select.Trigger>
            <Select.Content style="--accent-color: {color}">
              <Select.Group>
                {#each columnOptions as option (option.name)}
                  <Select.Item
                    value={option.name}
                    label={option.name}
                    class="[&_.cn-select-item-indicator-icon]:text-(--accent-color)"
                  >
                    {option.name}
                  </Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
        <ModePicker
          entries={ATTRIBUTE_MODES}
          current={attributeMode}
          info={ATTRIBUTE_MODE_INFO}
          onselect={(v) => (attributeMode = v)}
        />
      </div>
      <div>
        <ValuePicker
          label="Values"
          options={values}
          chosen={selected}
          onchoose={(next) => (selected = next)}
          {truncated}
          error={valuesError}
          limit={VALUE_LIMIT}
        />
      </div>
    </div>
  {:else if kind === "endpoint"}
    <ModePicker
      entries={ENDPOINT_MODES}
      current={endpointMode}
      info={ENDPOINT_MODE_INFO}
      onselect={(v) => (endpointMode = v)}
    />
    <!-- Both positions are listed at once, so the user can see the start and
         end activities together instead of toggling between them. A case can
         only start or end with one value, so checking a box in either list
         switches the filter to that position. -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="border-border border p-2">
        <ValuePicker
          label="Starts with"
          options={startValues}
          chosen={startChosen}
          onchoose={chooseStart}
          truncated={startTruncated}
          error={startValuesError}
          limit={VALUE_LIMIT}
          labelClass="text-sm font-semibold text-foreground"
        />
      </div>
      <div class="border-border border p-2">
        <ValuePicker
          label="Ends with"
          options={endValues}
          chosen={endChosen}
          onchoose={chooseEnd}
          truncated={endTruncated}
          error={endValuesError}
          limit={VALUE_LIMIT}
          labelClass="text-sm font-semibold text-foreground"
        />
      </div>
    </div>
  {:else}
    {#if picksColumn}
      <Field.Field class="w-1/2">
        <Field.FieldLabel for="filter-column">
          {kind === "follower" ? "Filter by" : "Column"}
        </Field.FieldLabel>
        <Select.Root
          type="single"
          value={column}
          onValueChange={(next) => {
            column = next;
            referenceValues = [];
            followerValues = [];
          }}
        >
          <Select.Trigger id="filter-column">{column || "Pick a column"}</Select.Trigger>
          <Select.Content style="--accent-color: {color}">
            <Select.Group>
              {#each columnOptions as option (option.name)}
                <Select.Item
                  value={option.name}
                  label={option.name}
                  class="[&_.cn-select-item-indicator-icon]:text-(--accent-color)"
                >
                  {option.name}
                </Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </Field.Field>
    {/if}

    {#if kind === "numeric"}
      <ModePicker
        entries={NUMERIC_MODES}
        current={numericMode}
        info={NUMERIC_MODE_INFO}
        onselect={(v) => (numericMode = v)}
      />
    {:else if kind === "timeframe"}
      <ModePicker
        entries={TIMEFRAME_MODES}
        current={timeframeMode}
        info={TIMEFRAME_MODE_INFO}
        onselect={(v) => (timeframeMode = v)}
      />
    {:else if kind === "duration"}
      <ModePicker
        entries={NUMERIC_MODES}
        current={durationMode}
        info={NUMERIC_MODE_INFO}
        onselect={(v) => (durationMode = v)}
      />
    {:else if kind === "follower"}
      <ModePicker
        entries={FOLLOWER_MODES}
        current={followerMode}
        info={FOLLOWER_MODE_INFO}
        onselect={(v) => (followerMode = v)}
      />
    {/if}

    {#if kind === "numeric"}
      <div class="flex w-1/2 gap-3">
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
    {:else if kind === "duration"}
      <Field.Field>
        <div class="flex items-center gap-2">
          <Field.FieldLabel>Case duration</Field.FieldLabel>
          <span class="text-muted-foreground ml-auto font-mono text-xs">{durationSummary}</span>
          <Button
            variant="ghost"
            size="xs"
            onclick={() => {
              durationMinMs = null;
              durationMaxMs = null;
            }}
          >
            Reset
          </Button>
        </div>
        <DurationHistogram
          {project}
          chain={precedingChain}
          {color}
          bind:min={durationMinMs}
          bind:max={durationMaxMs}
        />
      </Field.Field>
    {:else if kind === "timeframe"}
      <Field.Field>
        <div class="flex items-center gap-2">
          <Field.FieldLabel>Window</Field.FieldLabel>
          <span class="text-muted-foreground ml-auto font-mono text-xs">{timeframeSummary}</span>
          <Button
            variant="ghost"
            size="xs"
            onclick={() => {
              from = null;
              to = null;
            }}
          >
            Reset
          </Button>
        </div>
        <TimeframePicker {project} chain={precedingChain} {color} bind:from bind:to />
        <Field.FieldDescription>
          Drag across the chart to select a window, or pick its first and last day on the calendar.
        </Field.FieldDescription>
      </Field.Field>
    {:else if kind === "follower"}
      <!-- Reference on the left, follower on the right: the pair reads in the
           order the filter looks for it. -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="border-border border p-2">
          <ValuePicker
            label="Reference values"
            options={values}
            chosen={referenceValues}
            onchoose={(next) => (referenceValues = next)}
            {truncated}
            error={valuesError}
            limit={VALUE_LIMIT}
          />
        </div>
        <div class="border-border border p-2">
          <ValuePicker
            label="Follower values"
            options={values}
            chosen={followerValues}
            onchoose={(next) => (followerValues = next)}
            {truncated}
            error={valuesError}
            limit={VALUE_LIMIT}
          />
        </div>
      </div>
    {/if}
  {/if}

  <!-- Only shown once the filter is complete enough to measure — an incomplete
       draft has no impact worth naming. -->
  {#if valid}
    <Field.FieldSeparator />
  {/if}

  <!-- Impact and the actions share one row, so the measurement reads as the
       thing being confirmed rather than a note above the buttons. -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    {#if valid}
      <Field.Field class="min-w-48 flex-1">
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

    <div class="ml-auto flex shrink-0 gap-2">
      <Button variant="ghost" onclick={oncancel}>Cancel</Button>
      <Button
        disabled={!valid}
        onclick={save}
        class="text-background bg-(--accent-color) hover:bg-(--accent-color) hover:opacity-90"
      >
        {filter ? "Save filter" : "Add filter"}
      </Button>
    </div>
  </div>
</Field.FieldGroup>

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
    FOLLOWER_MODES,
    FOLLOWER_MODE_INFO,
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
    type FollowerMode,
    type NumericMode,
    type TimeframeMode
  } from "$lib/filters";
  import { chainImpact, type ChainStep } from "$lib/state/slices.svelte";
  import { formatDay, formatDuration, formatNumber } from "$lib/format";
  import type { Project } from "$lib/types";
  import DurationHistogram from "./duration-histogram.svelte";
  import TimeframePicker from "./timeframe-picker.svelte";
  import Search from "@lucide/svelte/icons/search";

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
  // A case-level column holds one value for the whole case, so it can never
  // produce a reference → follower pair across two different values.
  const eventLevel = $derived(categorical.filter((c) => c.granularity !== "case"));

  const kinds = $derived(
    [
      { kind: "attribute" as const, label: "Attribute", available: categorical.length > 0 },
      { kind: "numeric" as const, label: "Numeric", available: numericColumns.length > 0 },
      { kind: "timeframe" as const, label: "Timeframe", available: true },
      { kind: "endpoint" as const, label: "Start / end", available: activityColumn !== "" },
      { kind: "duration" as const, label: "Duration", available: true },
      { kind: "follower" as const, label: "Follows", available: eventLevel.length > 0 },
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
  let search = $state("");
  let referenceSearch = $state("");
  let followerSearch = $state("");

  let values = $state<ValueCount[]>([]);
  let truncated = $state(false);
  let valuesError = $state<string | null>(null);

  /** The columns a kind may read, and which one its value picker lists. */
  const columnOptions = $derived(
    kind === "numeric" ? numericColumns : kind === "follower" ? eventLevel : categorical
  );
  const picksColumn = $derived(
    kind === "attribute" || kind === "numeric" || kind === "follower"
  );

  /** The picker column: endpoint filters always pick from activities. */
  const pickerColumn = $derived(
    kind === "endpoint"
      ? activityColumn
      : kind === "attribute" || kind === "follower"
        ? column
        : ""
  );

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

  function toggled(chosen: string[], value: string): string[] {
    return chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];
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
        <RadioGroup.Item
          value={mode}
          id="mode-{mode}"
          class="data-checked:border-(--accent-color) data-checked:bg-(--accent-color) dark:data-checked:bg-(--accent-color) [&_[data-slot=radio-group-indicator]_svg]:bg-background"
        />
        <Field.FieldContent>
          <Field.FieldLabel for="mode-{mode}">{info[mode].label}</Field.FieldLabel>
          <Field.FieldDescription>{info[mode].description}</Field.FieldDescription>
        </Field.FieldContent>
      </Field.Field>
    {/each}
  </RadioGroup.Root>
{/snippet}

<!-- One list of the picker column's values. Rendered twice by the follower
     filter, which reads the same column as both reference and follower, so the
     selection and its search box are passed in rather than held here. -->
{#snippet valuePicker(
  label: string,
  chosen: string[],
  choose: (next: string[]) => void,
  term: string,
  setTerm: (next: string) => void
)}
  {@const listed = values.filter((v) => v.value.toLowerCase().includes(term.trim().toLowerCase()))}
  <Field.Field>
    <div class="flex items-center gap-2">
      <Field.FieldLabel>{label}</Field.FieldLabel>
      <span class="text-muted-foreground ml-auto text-xs">
        {chosen.length}/{values.length} selected
      </span>
      <Button variant="ghost" size="xs" onclick={() => choose(listed.map((v) => v.value))}>
        All
      </Button>
      <Button variant="ghost" size="xs" onclick={() => choose([])}>None</Button>
    </div>
    {#if values.length > 8}
      <InputGroup.Root>
        <InputGroup.Input
          placeholder="Search values…"
          value={term}
          oninput={(e) => setTerm(e.currentTarget.value)}
        />
        <InputGroup.Addon>
          <Search />
        </InputGroup.Addon>
      </InputGroup.Root>
    {/if}
    {#if valuesError}
      <Field.FieldError>{valuesError}</Field.FieldError>
    {:else}
      <ScrollArea.Root class="border-border h-56 border">
        {#each listed as option (option.value)}
          <Label
            class="hover:bg-muted flex cursor-pointer items-center gap-2 px-2.5 py-1.5 font-normal"
          >
            <Checkbox
              checked={chosen.includes(option.value)}
              onCheckedChange={() => choose(toggled(chosen, option.value))}
              class="data-checked:border-(--accent-color) data-checked:bg-(--accent-color) data-checked:text-background dark:data-checked:bg-(--accent-color)"
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
{/snippet}

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
          class="data-[state=on]:border-(--accent-color) data-[state=on]:bg-(--accent-color) data-[state=on]:text-background data-[state=on]:hover:bg-(--accent-color)"
        >
          {option.label}
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </Field.Field>

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
          selected = [];
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
        {#each [["start", "Starts with"], ["end", "Ends with"]] as [position, label] (position)}
          <ToggleGroup.Item
            value={position}
            class="data-[state=on]:border-(--accent-color) data-[state=on]:bg-(--accent-color) data-[state=on]:text-background data-[state=on]:hover:bg-(--accent-color)"
          >
            {label}
          </ToggleGroup.Item>
        {/each}
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
    {:else if kind === "duration"}
      {@render modes(
        NUMERIC_MODES,
        durationMode,
        NUMERIC_MODE_INFO,
        (v) => (durationMode = v as NumericMode)
      )}
    {:else if kind === "follower"}
      {@render modes(
        FOLLOWER_MODES,
        followerMode,
        FOLLOWER_MODE_INFO,
        (v) => (followerMode = v as FollowerMode)
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
        {@render valuePicker(
          "Reference values",
          referenceValues,
          (next) => (referenceValues = next),
          referenceSearch,
          (next) => (referenceSearch = next)
        )}
      </div>
      <div class="border-border border p-2">
        {@render valuePicker(
          "Follower values",
          followerValues,
          (next) => (followerValues = next),
          followerSearch,
          (next) => (followerSearch = next)
        )}
      </div>
    </div>
  {:else}
    <div class="w-1/2">
      {@render valuePicker(
        kind === "endpoint" ? "Activities" : "Values",
        selected,
        (next) => (selected = next),
        search,
        (next) => (search = next)
      )}
    </div>
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
        class="bg-(--accent-color) text-background hover:bg-(--accent-color) hover:opacity-90"
      >
        {filter ? "Save filter" : "Add filter"}
      </Button>
    </div>
  </div>
</Field.FieldGroup>

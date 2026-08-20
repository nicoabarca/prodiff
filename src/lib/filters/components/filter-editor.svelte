<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    ENDPOINT_MODES,
    ENDPOINT_MODE_INFO,
    type EndpointMode,
    type EndpointPosition
  } from "$lib/filters/filters/endpoint";
  import { isFilterComplete, type Filter, type FilterKind } from "$lib/filters/filters/filter";
  import { columnValues, VALUE_LIMIT } from "$lib/filters/state/distinct-values.svelte";
  import {
    FOLLOWER_MODES,
    FOLLOWER_MODE_INFO,
    type FollowerMode
  } from "$lib/filters/filters/follower";
  import {
    activityColumn,
    categoricalColumns,
    eventLevelColumns,
    numericColumns
  } from "$lib/filters/utils/columns";
  import { chainImpact } from "$lib/slices/invokers/chain-impact";
  import type { ResponseChainStep } from "$lib/slices/invokers/types";
  import { formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import ColumnSelect from "./column-select.svelte";
  import DurationEditor from "./editors/duration-editor.svelte";
  import TimeframeEditor from "./editors/timeframe-editor.svelte";
  import NumericEditor from "./editors/numeric-editor.svelte";
  import AttributeEditor from "./editors/attribute-editor.svelte";
  import ModePicker from "./mode-picker.svelte";
  import ValuePicker from "./value-picker.svelte";
  import DurationHistogram from "./duration-histogram.svelte";

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
  let followerMode = $state<FollowerMode>(
    initial?.kind === "follower" ? initial.mode : "eventually"
  );
  let referenceValues = $state<string[]>(
    initial?.kind === "follower" ? [...initial.reference] : []
  );
  let followerValues = $state<string[]>(initial?.kind === "follower" ? [...initial.follower] : []);

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

  const attributeValues = columnValues(
    () => project,
    () => pickerColumn
  );
  const startActivities = columnValues(
    () => project,
    () => (kind === "endpoint" ? activity : ""),
    () => "start"
  );
  const endActivities = columnValues(
    () => project,
    () => (kind === "endpoint" ? activity : ""),
    () => "end"
  );

  /**
   * The draft a child editor last emitted. Kinds still built here fall back to
   * `build`; each one moves over as its editor is split out.
   */
  let childDraft = $state<Filter | null>(null);
  const SPLIT: FilterKind[] = ["duration", "timeframe", "numeric", "attribute"];

  function build(): Filter | null {
    switch (kind) {
      case "endpoint":
        return { kind, position: endpointPosition, mode: endpointMode, activities: [...selected] };
      // Split out into their own editors; `draft` never calls this for them.
      case "duration":
      case "timeframe":
      case "numeric":
      case "attribute":
        return null;
      case "follower":
        return {
          kind,
          column,
          mode: followerMode,
          reference: [...referenceValues],
          follower: [...followerValues]
        };
    }
  }

  const draft = $derived(SPLIT.includes(kind) ? childDraft : build());
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
        childDraft = null;
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
    <AttributeEditor
      {project}
      initial={initial?.kind === "attribute" ? initial : null}
      {color}
      ondraft={(next) => (childDraft = next)}
    />
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
          options={startActivities.values}
          chosen={startChosen}
          onchoose={chooseStart}
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
          onchoose={chooseEnd}
          truncated={endActivities.truncated}
          error={endActivities.error}
          limit={VALUE_LIMIT}
          labelClass="text-sm font-semibold text-foreground"
        />
      </div>
    </div>
  {:else if kind === "numeric"}
    <NumericEditor
      {project}
      initial={initial?.kind === "numeric" ? initial : null}
      {color}
      ondraft={(next) => (childDraft = next)}
    />
  {:else if kind === "timeframe"}
    <TimeframeEditor
      {project}
      initial={initial?.kind === "timeframe" ? initial : null}
      {precedingChain}
      {color}
      ondraft={(next) => (childDraft = next)}
    />
  {:else if kind === "duration"}
    <DurationEditor
      {project}
      initial={initial?.kind === "duration" ? initial : null}
      {precedingChain}
      {color}
      ondraft={(next) => (childDraft = next)}
    />
  {:else}
    {#if picksColumn}
      <ColumnSelect
        columns={columnOptions}
        value={column}
        onselect={(next) => {
          column = next;
          referenceValues = [];
          followerValues = [];
        }}
        {color}
        label={kind === "follower" ? "Filter by" : "Column"}
        class="w-1/2"
      />
    {/if}

    {#if kind === "follower"}
      <ModePicker
        entries={FOLLOWER_MODES}
        current={followerMode}
        info={FOLLOWER_MODE_INFO}
        onselect={(v) => (followerMode = v)}
      />
    {/if}

    {#if kind === "follower"}
      <!-- Reference on the left, follower on the right: the pair reads in the
           order the filter looks for it. -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="border-border border p-2">
          <ValuePicker
            label="Reference values"
            options={attributeValues.values}
            chosen={referenceValues}
            onchoose={(next) => (referenceValues = next)}
            truncated={attributeValues.truncated}
            error={attributeValues.error}
            limit={VALUE_LIMIT}
          />
        </div>
        <div class="border-border border p-2">
          <ValuePicker
            label="Follower values"
            options={attributeValues.values}
            chosen={followerValues}
            onchoose={(next) => (followerValues = next)}
            truncated={attributeValues.truncated}
            error={attributeValues.error}
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

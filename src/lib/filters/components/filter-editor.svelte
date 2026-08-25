<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { isFilterComplete, type Filter, type FilterKind } from "$lib/filters/kind/filter";
  import {
    activityColumn,
    categoricalColumns,
    eventLevelColumns,
    numericColumns
  } from "$lib/filters/utils/columns";
  import { filtersImpact } from "$lib/groups/invokers/filters-impact";
  import type { ResponseFilterStep } from "$lib/groups/invokers/types";
  import { formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import DurationEditor from "./editors/duration-editor.svelte";
  import TimeframeEditor from "./editors/timeframe-editor.svelte";
  import NumericEditor from "./editors/numeric-editor.svelte";
  import AttributeEditor from "./editors/attribute-editor.svelte";
  import FollowerEditor from "./editors/follower-editor.svelte";
  import EndpointEditor from "./editors/endpoint-editor.svelte";

  let {
    project,
    filter = null,
    /** Filters applied before this one — the draft's impact is measured on top of them. */
    precedingChain = [],
    /** The accent of the Group being edited, so its charts read as that Group. */
    color = "var(--group-original)",
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
  /**
   * What the kind's editor last emitted, or `null` while it has nothing
   * complete enough to save. Every kind builds its own filter, so this is the
   * only thing the editor knows about the draft's contents.
   */
  let draft = $state<Filter | null>(null);
  const valid = $derived(draft !== null && isFilterComplete(draft));

  // Live impact of the draft, measured on top of the filters that precede it.
  // Debounced because typing in a range box would otherwise re-scan per keystroke.
  let impact = $state<{ before: ResponseFilterStep; after: ResponseFilterStep } | null>(null);
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
      filtersImpact(project, [...precedingChain, candidate])
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
        draft = null;
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
      ondraft={(next) => (draft = next)}
    />
  {:else if kind === "endpoint"}
    <EndpointEditor
      {project}
      initial={initial?.kind === "endpoint" ? initial : null}
      ondraft={(next) => (draft = next)}
    />
  {:else if kind === "numeric"}
    <NumericEditor
      {project}
      initial={initial?.kind === "numeric" ? initial : null}
      {color}
      ondraft={(next) => (draft = next)}
    />
  {:else if kind === "timeframe"}
    <TimeframeEditor
      {project}
      initial={initial?.kind === "timeframe" ? initial : null}
      {precedingChain}
      {color}
      ondraft={(next) => (draft = next)}
    />
  {:else if kind === "duration"}
    <DurationEditor
      {project}
      initial={initial?.kind === "duration" ? initial : null}
      {precedingChain}
      {color}
      ondraft={(next) => (draft = next)}
    />
  {:else if kind === "follower"}
    <FollowerEditor
      {project}
      initial={initial?.kind === "follower" ? initial : null}
      {color}
      ondraft={(next) => (draft = next)}
    />
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

<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { Filter } from "$lib/filters/filters/filter";
  import {
    TIMEFRAME_MODES,
    TIMEFRAME_MODE_INFO,
    type TimeframeFilter,
    type TimeframeMode
  } from "$lib/filters/filters/timeframe";
  import { formatDay } from "$lib/format";
  import ModePicker from "../mode-picker.svelte";
  import TimeframePicker from "../timeframe-picker.svelte";

  /**
   * How a case overlaps a window of time. The picker hands over an inclusive
   * window — `from` at midnight, `to` at the last millisecond of its day — so
   * the bounds are the filter's own and need no adjusting here.
   */
  let {
    project,
    initial = null,
    precedingChain = [],
    color,
    ondraft
  }: {
    project: Project;
    initial?: TimeframeFilter | null;
    precedingChain?: Filter[];
    color: string;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const seed = untrack(() => initial);

  let mode = $state<TimeframeMode>(seed?.mode ?? "intersects");
  let from = $state<number | null>(seed?.from ?? null);
  let to = $state<number | null>(seed?.to ?? null);

  const summary = $derived(
    from === null || to === null ? "Nothing selected" : `${formatDay(from)} → ${formatDay(to)}`
  );

  $effect(() => {
    ondraft(from === null || to === null ? null : { kind: "timeframe", mode, from, to });
  });
</script>

<ModePicker
  entries={TIMEFRAME_MODES}
  current={mode}
  info={TIMEFRAME_MODE_INFO}
  onselect={(v) => (mode = v)}
/>

<Field.Field>
  <div class="flex items-center gap-2">
    <Field.FieldLabel>Window</Field.FieldLabel>
    <span class="text-muted-foreground ml-auto font-mono text-xs">{summary}</span>
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

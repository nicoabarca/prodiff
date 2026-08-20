<script lang="ts">
  import { untrack } from "svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import type { Project } from "$lib/event-log/types";
  import type { DurationFilter } from "$lib/filters/kind/duration";
  import type { Filter } from "$lib/filters/kind/filter";
  import { NUMERIC_MODES, NUMERIC_MODE_INFO, type NumericMode } from "$lib/filters/kind/numeric";
  import { formatDuration } from "$lib/format";
  import DurationHistogram from "../duration-histogram.svelte";
  import ModePicker from "../mode-picker.svelte";

  /**
   * How long a case runs, first event to last. The filter's bounds are days;
   * the histogram brushes milliseconds, so the two are converted at this
   * boundary and nowhere else.
   */
  let {
    project,
    initial = null,
    precedingChain = [],
    color,
    ondraft
  }: {
    project: Project;
    initial?: DurationFilter | null;
    precedingChain?: Filter[];
    color: string;
    ondraft: (draft: Filter | null) => void;
  } = $props();

  const DAY_MS = 86_400_000;

  // Seeded once, then owned here: the editor is remounted (via `{#key}`) to
  // point at a different filter, so tracking the prop would fight the user.
  const seed = untrack(() => initial);

  let mode = $state<NumericMode>(seed?.mode ?? "between");
  let minMs = $state<number | null>(seed?.min != null ? seed.min * DAY_MS : null);
  let maxMs = $state<number | null>(seed?.max != null ? seed.max * DAY_MS : null);

  /** The brushed range as the predicate it actually stands for. */
  const summary = $derived.by(() => {
    if (minMs === null && maxMs === null) return "Nothing selected";
    const low = formatDuration(minMs);
    const high = formatDuration(maxMs);
    switch (mode) {
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

  $effect(() => {
    ondraft({
      kind: "duration",
      mode,
      min: minMs === null ? null : minMs / DAY_MS,
      max: maxMs === null ? null : maxMs / DAY_MS
    });
  });
</script>

<ModePicker
  entries={NUMERIC_MODES}
  current={mode}
  info={NUMERIC_MODE_INFO}
  onselect={(v) => (mode = v)}
/>

<Field.Field>
  <div class="flex items-center gap-2">
    <Field.FieldLabel>Case duration</Field.FieldLabel>
    <span class="text-muted-foreground ml-auto font-mono text-xs">{summary}</span>
    <Button
      variant="ghost"
      size="xs"
      onclick={() => {
        minMs = null;
        maxMs = null;
      }}
    >
      Reset
    </Button>
  </div>
  <DurationHistogram {project} chain={precedingChain} {color} bind:min={minMs} bind:max={maxMs} />
</Field.Field>

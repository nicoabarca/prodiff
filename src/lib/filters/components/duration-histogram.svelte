<script lang="ts">
  /**
   * How long the cases in a population run for, as a histogram, with the
   * duration filter's bounds selected by brushing it.
   *
   * `min`/`max` are milliseconds and `null` when that side is unbounded — the
   * filter's own unit (days) is the editor's business, not the chart's.
   */
  import { untrack } from "svelte";
  import { Axis, Chart, Svg } from "layerchart";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { formatDuration, formatDurationParts, formatNumber } from "$lib/format";
  import type { Filter } from "$lib/filters/kind/filter";
  import { durationHistogram } from "$lib/filters/invokers/duration-histogram";
  import type { ResponseDurationBin } from "$lib/filters/invokers/types";
  import type { Project } from "$lib/event-log/types";

  let {
    project,
    /** Filters applied before this one — the distribution shown is theirs. */
    chain = [],
    /** The editing slice's accent, so the chart reads as that population. */
    color = "var(--slice-base)",
    min = $bindable(),
    max = $bindable()
  }: {
    project: Project;
    chain?: Filter[];
    color?: string;
    min: number | null;
    max: number | null;
  } = $props();

  /** How long typing settles before the brush follows it, in ms. */
  const INPUT_DEBOUNCE = 300;
  /** Pending while a keystroke is settling — the fields are the source of truth then. */
  let applyTimer: ReturnType<typeof setTimeout> | undefined;

  let bins = $state<ResponseDurationBin[] | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    let stale = false;
    durationHistogram(project, chain)
      .then((result) => {
        if (!stale) bins = result;
      })
      .catch((cause) => {
        if (!stale) error = String(cause);
      });
    return () => {
      stale = true;
    };
  });

  /** A brush edge as a plain number — the brush reports `null` when unset. */
  function edge(value: number | Date | null | undefined): number | null {
    return typeof value === "number" ? value : null;
  }

  /** The observed range: both the chart's x domain and the bound the fields clamp to. */
  const domain = $derived(
    bins && bins.length > 0
      ? { min: bins[0].startMs, max: bins[bins.length - 1].endMs }
      : { min: 0, max: 0 }
  );

  interface Parts {
    d: number;
    h: number;
    m: number;
    s: number;
  }

  // Each unit carries its own ceiling so a longer span has to be written in the
  // unit above it — a day is "1d", never "24h".
  const UNITS = [
    { key: "d", label: "Days", max: null },
    { key: "h", label: "Hours", max: 23 },
    { key: "m", label: "Minutes", max: 59 },
    { key: "s", label: "Seconds", max: 59 }
  ] as const;

  function partsToMs(parts: Parts): number {
    return (((parts.d * 24 + parts.h) * 60 + parts.m) * 60 + parts.s) * 1000;
  }

  function msToParts(millis: number): Parts {
    let remaining = Math.round(millis / 1000);
    const take = (size: number) => {
      const value = Math.floor(remaining / size);
      remaining -= value * size;
      return value;
    };
    return { d: take(86_400), h: take(3_600), m: take(60), s: remaining };
  }

  function samePartsAs(a: Parts, b: Parts): boolean {
    return a.d === b.d && a.h === b.h && a.m === b.m && a.s === b.s;
  }

  // The fields and the brush hold the same two figures and keep each other
  // current. The comparison is on the parts rather than on their milliseconds:
  // the fields are only accurate to the second, so a sub-second brushed bound
  // would never equal what it writes and the effect would loop forever.
  let fromParts = $state(msToParts(min ?? 0));
  let toParts = $state(msToParts(max ?? 0));

  $effect(() => {
    const nextFrom = msToParts(min ?? 0);
    const nextTo = msToParts(max ?? 0);
    // Typing owns the fields until it settles: syncing mid-edit would snap the
    // "1" on the way to "15" back to whatever the brush still holds.
    if (applyTimer !== undefined) return;
    untrack(() => {
      if (!samePartsAs(fromParts, nextFrom)) fromParts = nextFrom;
      if (!samePartsAs(toParts, nextTo)) toParts = nextTo;
    });
  });

  /** From has to be the shorter duration — an inverted pair brushes nothing. */
  const inverted = $derived(partsToMs(fromParts) > partsToMs(toParts));

  /**
   * Pushes the typed pair onto the brush, pulled into the durations the log
   * actually holds. An inverted pair is left unapplied and the previous
   * selection stands. Debounced, so a half-typed number never applies.
   */
  function apply() {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(() => {
      applyTimer = undefined;
      if (inverted) return;
      const clamp = (value: number) => Math.min(Math.max(value, domain.min), domain.max);
      min = clamp(partsToMs(fromParts));
      max = clamp(partsToMs(toParts));
    }, INPUT_DEBOUNCE);
  }

  /** A field's keystroke as a whole non-negative number within its unit's ceiling. */
  function bounded(raw: string, ceiling: number | null): number {
    const value = Math.floor(Math.abs(Number(raw)));
    if (!Number.isFinite(value)) return 0;
    return ceiling === null ? value : Math.min(value, ceiling);
  }

  function selected(bin: ResponseDurationBin): boolean {
    if (min === null && max === null) return true;
    const middle = (bin.startMs + bin.endMs) / 2;
    return (min === null || middle >= min) && (max === null || middle <= max);
  }
</script>

<!-- Declared at the template root: a snippet inside a component would be read
     as one of that component's props rather than a local. -->
{#snippet unitFields(id: string, parts: Parts)}
  <div class="grid grid-cols-4 gap-2">
    {#each UNITS as unit (unit.key)}
      <div class="grid gap-1.5">
        <Label for="{id}-{unit.key}" class="text-muted-foreground text-xs font-normal">
          {unit.label}
        </Label>
        <Input
          id="{id}-{unit.key}"
          type="number"
          min="0"
          max={unit.max}
          step="1"
          value={parts[unit.key]}
          oninput={(e) => {
            const next = bounded(e.currentTarget.value, unit.max);
            // A rejected keystroke leaves the state as it was, so the field is
            // corrected here rather than by a re-render that never comes.
            e.currentTarget.value = String(next);
            parts[unit.key] = next;
            apply();
          }}
        />
      </div>
    {/each}
  </div>
{/snippet}

{#if error}
  <p class="text-destructive text-xs">{error}</p>
{:else if !bins}
  <Skeleton class="h-40 w-full" />
{:else if bins.length === 0}
  <p class="text-muted-foreground text-xs">No cases to measure.</p>
{:else}
  <Chart
    data={bins}
    x="startMs"
    xDomain={[domain.min, domain.max]}
    y="cases"
    yDomain={[0, null]}
    padding={{ left: 48, bottom: 22, top: 8, right: 8 }}
    height={180}
    brush={{
      x: [min, max],
      range: { style: `background: color-mix(in oklab, ${color} 15%, transparent)` },
      handle: { style: `background: ${color}` },
      handleSize: 6,
      onChange: (e) => {
        min = edge(e.brush.x?.[0]);
        max = edge(e.brush.x?.[1]);
      }
    }}
  >
    {#snippet children({ context })}
      <Svg>
        <Axis placement="left" grid rule={false} ticks={3} format={formatNumber} />
        <Axis placement="bottom" rule ticks={4} format={(v) => formatDuration(Number(v))} />
        {#each bins as bin (bin.startMs)}
          {@const left = context.xScale(bin.startMs)}
          {@const right = context.xScale(bin.endMs)}
          {@const top = context.yScale(bin.cases)}
          <rect
            x={left}
            width={Math.max(1, right - left - 1)}
            y={top}
            height={Math.max(0, context.yScale(0) - top)}
            fill={selected(bin) ? color : "var(--muted-foreground)"}
            fill-opacity={selected(bin) ? 1 : 0.3}
          >
            <title
              >{formatDuration(bin.startMs)} – {formatDuration(bin.endMs)}:
              {formatNumber(bin.cases)} cases</title
            >
          </rect>
        {/each}
      </Svg>
    {/snippet}
  </Chart>

  <div class="grid gap-3 sm:grid-cols-2">
    <div class="border-border grid gap-2 border p-3">
      <Field.FieldLabel>From</Field.FieldLabel>
      {@render unitFields("duration-from", fromParts)}
    </div>
    <div class="border-border grid gap-2 border p-3">
      <Field.FieldLabel>To</Field.FieldLabel>
      {@render unitFields("duration-to", toParts)}
    </div>
  </div>
  {#if inverted}
    <Field.FieldError>From has to be a shorter duration than To.</Field.FieldError>
  {/if}
  <Field.FieldDescription>
    Drag across the chart to select a range, or write one in the fields. Cases in this population
    run {formatDurationParts(domain.min)} to {formatDurationParts(domain.max)}.
  </Field.FieldDescription>
{/if}

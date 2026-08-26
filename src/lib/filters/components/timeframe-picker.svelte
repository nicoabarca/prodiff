<script lang="ts">
  /**
   * How many cases are open on each day of the log, with the timeframe filter's
   * window selected by brushing the chart or by the two calendars.
   *
   * `from`/`to` are epoch milliseconds and day-aligned: `from` at midnight, `to`
   * at the last millisecond of its day.
   */
  import { CalendarDate, type DateValue } from "@internationalized/date";
  import { Area, Axis, Chart, Svg } from "layerchart";
  import { Calendar } from "$lib/components/ui/calendar/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { formatDay, formatNumber } from "$lib/format";
  import type { Filter } from "$lib/filters/kind/filter";
  import { dailyCaseLoad } from "$lib/filters/invokers/daily-case-load";
  import type { ResponseDayLoad } from "$lib/filters/invokers/types";
  import type { Project } from "$lib/event-log/types";

  let {
    project,
    /** Filters applied before this one. The load shown is theirs. */
    chain = [],
    /** The editing slice's accent, so the chart reads as that population. */
    color = "var(--group-original)",
    from = $bindable(),
    to = $bindable()
  }: {
    project: Project;
    chain?: Filter[];
    color?: string;
    from: number | null;
    to: number | null;
  } = $props();

  const DAY_MS = 86_400_000;

  let days = $state<ResponseDayLoad[] | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    let stale = false;
    dailyCaseLoad(project, chain)
      .then((result) => {
        if (!stale) days = result;
      })
      .catch((cause) => {
        if (!stale) error = String(cause);
      });
    return () => {
      stale = true;
    };
  });

  // Days are counted in UTC on the Rust side and the log's timestamps carry no
  // zone, so every conversion here stays in UTC.
  function toCalendarDate(millis: number): CalendarDate {
    const date = new Date(millis);
    return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  function startOfDay(date: DateValue): number {
    return Date.UTC(date.year, date.month - 1, date.day);
  }

  /** The span the log covers: the chart's x domain and the calendars' limits. */
  const span = $derived(
    days && days.length > 0
      ? { first: days[0].dayMs, last: days[days.length - 1].dayMs }
      : { first: 0, last: 0 }
  );

  /** A brush edge as a plain number. The brush reports `null` when unset. */
  function edge(value: number | Date | null | undefined): number | null {
    return typeof value === "number" ? value : null;
  }

  /** Midnight of the day holding `millis`, held inside the days the log covers. */
  function dayStart(millis: number): number {
    const day = Math.floor(millis / DAY_MS) * DAY_MS;
    return Math.min(Math.max(day, span.first), span.last);
  }
</script>

{#if error}
  <p class="text-destructive text-xs">{error}</p>
{:else if !days}
  <Skeleton class="h-32 w-full" />
{:else if days.length === 0}
  <p class="text-muted-foreground text-xs">No cases to measure.</p>
{:else}
  <Chart
    data={days}
    x="dayMs"
    xDomain={[span.first, span.last + DAY_MS]}
    y="cases"
    yDomain={[0, null]}
    padding={{ left: 48, bottom: 22, top: 8, right: 8 }}
    height={140}
    brush={{
      x: [from, to === null ? null : to + 1],
      range: { style: `background: color-mix(in oklab, ${color} 15%, transparent)` },
      handle: { style: `background: ${color}` },
      handleSize: 6,
      onChange: (e) => {
        // Snapped to whole days. The brush's right edge is exclusive: it sits at the
        // midnight that ends the last selected day, which is why the domain runs a day
        // past the log and the last day holds `end - 1`.
        const start = edge(e.brush.x?.[0]);
        const end = edge(e.brush.x?.[1]);
        from = start === null ? null : dayStart(start);
        to = end === null ? null : dayStart(end - 1) + DAY_MS - 1;
      }
    }}
  >
    <Svg>
      <Axis placement="left" grid rule={false} ticks={3} format={formatNumber} />
      <Axis placement="bottom" rule ticks={4} format={(v) => formatDay(Number(v))} />
      <Area
        fill={color}
        fillOpacity={0.2}
        line={{ stroke: color, "stroke-width": 1 } as Record<string, unknown>}
      />
    </Svg>
  </Chart>

  <div class="grid gap-3 sm:grid-cols-2">
    <div class="border-border grid gap-1 border p-2">
      <span class="text-muted-foreground px-1 text-xs">First day</span>
      <Calendar
        type="single"
        value={from === null ? undefined : toCalendarDate(from)}
        minValue={toCalendarDate(span.first)}
        maxValue={toCalendarDate(to ?? span.last)}
        placeholder={toCalendarDate(from ?? span.first)}
        onValueChange={(next) => {
          from = next ? startOfDay(next) : null;
        }}
        class="mx-auto w-fit p-0 **:data-bits-day:text-xs [&_td]:text-xs [&_th]:text-[0.65rem]"
      />
    </div>
    <div class="border-border grid gap-1 border p-2">
      <span class="text-muted-foreground px-1 text-xs">Last day</span>
      <Calendar
        type="single"
        value={to === null ? undefined : toCalendarDate(to)}
        minValue={toCalendarDate(from ?? span.first)}
        maxValue={toCalendarDate(span.last)}
        placeholder={toCalendarDate(to ?? span.last)}
        onValueChange={(next) => {
          to = next ? startOfDay(next) + DAY_MS - 1 : null;
        }}
        class="mx-auto w-fit p-0 **:data-bits-day:text-xs [&_td]:text-xs [&_th]:text-[0.65rem]"
      />
    </div>
  </div>
{/if}

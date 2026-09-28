<script lang="ts">
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import { formatDay, formatDuration, formatNumber } from "$lib/format";
  import type { Project } from "$lib/event-log/types";
  import { isTemporal } from "$lib/event-log/utils/field-settings";
  import type { Filter } from "$lib/filters/kind/filter";
  import { filtersKey } from "$lib/filters/utils/key";
  import { computeStats } from "$lib/groups/state/groups.svelte";
  import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
  import type { Group } from "$lib/groups/types";
  import {
    analysisColumns,
    attributeLabel
  } from "$lib/custom-attributes/state/custom-attributes.svelte";
  import { groupComparison } from "$lib/statistics/invokers/group-comparison";
  import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
  import { pickGroup, pickable, statisticsGroups } from "$lib/statistics/state/selection.svelte";
  import { formatSigned, isGap, percentChange } from "$lib/statistics/utils/change";
  import {
    activityFigures,
    biggestDifferences,
    metricFigure,
    OVERVIEW_METRICS,
    type Pane
  } from "$lib/statistics/utils/figures";
  import ActivitiesPane from "$lib/statistics/components/activities-pane.svelte";
  import AttributesPane from "$lib/statistics/components/attributes-pane.svelte";
  import DataDrawer from "$lib/statistics/components/data-drawer.svelte";
  import DurationPane from "$lib/statistics/components/duration-pane.svelte";
  import GroupPicker from "$lib/statistics/components/group-picker.svelte";
  import OverviewPane from "$lib/statistics/components/overview-pane.svelte";
  import VariantsPane from "$lib/statistics/components/variants-pane.svelte";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import Table2 from "@lucide/svelte/icons/table-2";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";

  let { project }: { project: Project } = $props();

  const DAY_MS = 86_400_000;

  let pane = $state<Pane>("overview");
  let drawerOpen = $state(false);
  let narrowed = $state<{ group: Group; filters: Filter[]; label: string } | null>(null);

  const groups = $derived(statisticsGroups(project.id));
  const options = $derived(pickable(project.id));
  const ids = $derived(groups.map((group) => group.id));
  const pair = $derived(groups.length === 2);
  const attributes = $derived(
    analysisColumns(project)
      .filter(
        (column) =>
          column.role === "other" &&
          !project.hiddenColumns.includes(column.name) &&
          !isTemporal(column.type)
      )
      .map((column) => column.name)
  );

  let stats = $state<Record<string, ResponseEventLogStats>>({});
  let comparison = $state<ResponseGroupComparison | null>(null);
  let error = $state<string | null>(null);

  /** Identifies what the figures describe: the Groups, what they hold, and the columns. */
  const wantedKey = $derived(
    JSON.stringify([
      groups.map((group) => `${group.id}:${filtersKey(group.filters)}`),
      analysisColumns(project),
      attributes
    ])
  );

  let lastKey = "";
  $effect(() => {
    const key = wantedKey;
    const wanted = groups;
    const names = attributes;
    if (key === lastKey) return;
    lastKey = key;

    let stale = false;
    error = null;
    comparison = null;
    Promise.all([
      computeStats(project, wanted),
      groupComparison(
        project,
        wanted.map((group) => group.id),
        names
      )
    ])
      .then(([nextStats, nextComparison]) => {
        if (stale) return;
        stats = nextStats;
        comparison = nextComparison;
      })
      .catch((cause) => {
        if (stale) return;
        error = String(cause);
        // A failed run must not be marked done, or it would never retry.
        lastKey = "";
      });
    return () => {
      stale = true;
    };
  });

  function openDrawer() {
    narrowed = null;
    drawerOpen = true;
  }

  function openTail(group: Group, fromMs: number) {
    narrowed = {
      group,
      filters: [{ kind: "duration", mode: "above", min: fromMs / DAY_MS, max: null }],
      label: `cases above P90 (${formatDuration(fromMs)})`
    };
    drawerOpen = true;
  }

  /** Each pane's headline figure, for the list on the left. */
  const tabs = $derived.by(() => {
    const change = (value: number | null) => formatSigned(value, 1, "%");
    const median = OVERVIEW_METRICS.find((m) => m.label === "Median case duration");
    const variants = OVERVIEW_METRICS.find((m) => m.label === "Variants");
    const medianDelta = median ? metricFigure(median, ids, stats).delta : null;
    const variantDelta = variants ? metricFigure(variants, ids, stats).delta : null;
    const activityGaps = comparison
      ? activityFigures(comparison, ids, "share").filter((f) => isGap(f.delta)).length
      : 0;
    const significant = comparison?.attributes.filter((row) => row.test?.significant).length ?? 0;
    const overviewGaps = comparison ? biggestDifferences(comparison, ids, 99).length : 0;
    const a = stats[ids[0]];
    return [
      {
        id: "overview" as const,
        title: "Overview",
        sub: pair ? "Where the two differ" : "Core metrics",
        delta: pair ? `${overviewGaps} gaps` : "",
        hot: overviewGaps > 0
      },
      {
        id: "duration" as const,
        title: "Case duration",
        sub: "Distribution & percentiles",
        delta: pair ? change(medianDelta) : "",
        hot: comparison?.durationTest?.significant ?? false
      },
      {
        id: "activities" as const,
        title: "Activities",
        sub: `${formatNumber(comparison?.activities.length ?? a?.activities ?? 0)} activity classes`,
        delta: pair ? `${activityGaps} gaps` : "",
        hot: activityGaps > 0
      },
      {
        id: "attributes" as const,
        title: "Attributes",
        sub: `${attributes.length} visible columns`,
        delta: pair ? `${significant} sig.` : "",
        hot: significant > 0
      },
      {
        id: "variants" as const,
        title: "Variants",
        sub: `${formatNumber(comparison?.variantCensus.total ?? a?.variants ?? 0)} distinct paths`,
        delta: pair ? change(variantDelta) : "",
        hot: isGap(variantDelta)
      }
    ];
  });

  /** One sentence per pane answering what it is for, from the figures on screen. */
  const answer = $derived.by(() => {
    if (!comparison) return "";
    const [a, b] = groups;
    if (!b) {
      return {
        overview: `The core figures of ${a.name}. Pick a second group to compare.`,
        duration: `How long the cases of ${a.name} take, start to end.`,
        activities: `How often each activity occurs in ${a.name}.`,
        attributes: `How the attribute columns are distributed in ${a.name}.`,
        variants: `The paths the cases of ${a.name} follow.`
      }[pane];
    }
    if (pane === "overview") {
      const top = biggestDifferences(comparison, ids, 1)[0];
      return top
        ? `${b.name} differs most in ${top.what} (${top.label}, ${top.measure}).`
        : `No activity, attribute value or variant differs by 5 pp or more.`;
    }
    if (pane === "duration") {
      const [fa, fb] = ids.map((id) => comparison?.groups.find((g) => g.id === id)?.duration);
      if (!fa || !fb) return "One of the groups has no cases.";
      const delta = percentChange(fa.median, fb.median);
      const gap = fb.median - fa.median;
      const test = comparison.durationTest;
      const verdict = test ? (test.significant ? "significant" : "not significant") : "untested";
      return Math.abs(gap) < 1000
        ? `Median case duration is the same in both (${verdict}).`
        : `Median is ${formatDuration(Math.abs(gap))} ${gap > 0 ? "longer" : "shorter"} in ${b.name} (${formatSigned(delta, 1, "%")}, ${verdict}).`;
    }
    if (pane === "activities") {
      const top = activityFigures(comparison, ids, "share")[0];
      return top && isGap(top.delta)
        ? `${b.name} ${(top.delta ?? 0) > 0 ? "reaches" : "skips"} ${top.name} more often: ${formatSigned(top.delta, 1, " pp")} of cases.`
        : "Every activity reaches about the same share of cases in both.";
    }
    if (pane === "attributes") {
      const top = [...comparison.attributes]
        .filter((row) => row.test?.significant)
        .sort((x, y) => (y.test?.effectSize ?? 0) - (x.test?.effectSize ?? 0))[0];
      return top
        ? `${attributeLabel(top.name)} differs most between the two.`
        : "No attribute column differs significantly.";
    }
    const census = comparison.variantCensus;
    return `${formatNumber(census.shared)} of ${formatNumber(census.total)} variants appear in both; ${groups
      .map((group) => `${formatNumber(census.only[group.id] ?? 0)} only in ${group.name}`)
      .join(", ")}.`;
  });

  const title = $derived(tabs.find((tab) => tab.id === pane)?.title ?? "");
  const timespan = $derived.by(() => {
    const a = stats[ids[0]];
    if (!a?.timespanStart || !a.timespanEnd) return null;
    const start = Date.parse(a.timespanStart);
    const end = Date.parse(a.timespanEnd);
    const b = pair ? stats[ids[1]] : null;
    const covered =
      b?.timespanStart && b.timespanEnd && end > start
        ? ((Date.parse(b.timespanEnd) - Date.parse(b.timespanStart)) / (end - start)) * 100
        : null;
    return { range: `${formatDay(start)} → ${formatDay(end)}`, covered };
  });
  const a = $derived(stats[ids[0]]);
</script>

<div class="relative flex min-h-0 flex-1 flex-col">
  <div class="flex min-h-0 flex-1">
    <nav
      class="bg-sidebar flex w-56 shrink-0 flex-col border-r"
      aria-label="Statistics"
      data-tour="statistics-panes"
    >
      <div
        class="text-muted-foreground px-3.5 pt-3 pb-2 text-[0.625rem] font-bold tracking-widest uppercase"
      >
        Statistics
      </div>
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          aria-current={pane === tab.id ? "page" : undefined}
          class="hover:bg-muted flex w-full cursor-pointer items-baseline gap-2 border-l-2 px-3.5 py-2.25 text-left {pane ===
          tab.id
            ? 'bg-muted border-l-primary'
            : 'border-l-transparent'}"
          onclick={() => (pane = tab.id)}
        >
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-semibold">{tab.title}</span>
            <span class="text-muted-foreground mt-px block truncate text-[0.6875rem]"
              >{tab.sub}</span
            >
          </span>
          {#if comparison}
            <span
              class="font-mono text-[0.6875rem] {tab.hot
                ? 'text-destructive'
                : 'text-muted-foreground'}"
            >
              {tab.delta}
            </span>
          {/if}
        </button>
      {/each}
      {#if timespan}
        <div
          class="text-muted-foreground mt-auto border-t px-3.5 py-3 text-[0.6875rem] leading-relaxed"
        >
          <span class="block">Timespan</span>
          <span class="text-foreground block font-mono">{timespan.range}</span>
          {#if timespan.covered !== null}
            <span class="block font-mono">
              {groups[1].name} covers {Math.min(timespan.covered, 100).toFixed(0)}% of it
            </span>
          {/if}
        </div>
      {/if}
    </nav>

    <main class="bg-background min-w-0 flex-1 overflow-auto">
      <div
        class="bg-card flex flex-wrap items-center gap-3 border-b px-4.5 py-3.5"
        data-tour="statistics-compare"
      >
        <div class="flex min-w-64 flex-1 flex-col gap-0.75">
          <span class="text-[0.9375rem] font-semibold">{title}</span>
          {#if comparison}
            <span class="text-foreground/70 text-xs text-pretty">{answer}</span>
          {:else}
            <Skeleton class="h-3.5 w-80" />
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <GroupPicker
            label="First group"
            {options}
            value={groups[0]}
            onpick={(id) => id && pickGroup(project.id, 0, id)}
          />
          <span class="text-muted-foreground font-mono text-[0.6875rem]">vs</span>
          <GroupPicker
            label="Second group"
            {options}
            value={groups[1] ?? null}
            optional
            onpick={(id) => pickGroup(project.id, 1, id)}
          />
        </div>
      </div>

      {#if error}
        <div class="p-4.5">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Could not compute the statistics</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      {:else if !comparison}
        <div class="flex flex-col gap-2 p-4.5">
          {#each { length: 8 } as _, row (row)}
            <Skeleton class="h-7 w-full" />
          {/each}
        </div>
      {:else if pane === "overview"}
        <OverviewPane {groups} {stats} {comparison} onpane={(next) => (pane = next)} />
      {:else if pane === "duration"}
        <DurationPane {groups} {comparison} ontail={openTail} />
      {:else if pane === "activities"}
        <ActivitiesPane {groups} {comparison} />
      {:else if pane === "attributes"}
        <AttributesPane {groups} {comparison} columnsHref="/app/projects/{project.id}/event-log" />
      {:else}
        <VariantsPane {groups} {comparison} />
      {/if}
    </main>
  </div>

  <button
    type="button"
    class="bg-sidebar hover:bg-muted flex h-9 shrink-0 cursor-pointer items-center gap-2.5 border-t px-4 text-left"
    onclick={openDrawer}
    data-tour="statistics-data"
  >
    <Table2 class="size-3.5" aria-hidden="true" />
    <span class="text-xs font-semibold">Event log data</span>
    {#if a}
      <span class="text-muted-foreground font-mono text-[0.6875rem]">
        {formatNumber(a.events)} events · {project.columns.length - project.hiddenColumns.length} of
        {project.columns.length} columns
      </span>
    {/if}
    <span class="text-muted-foreground ml-auto inline-flex items-center gap-1.5 text-[0.6875rem]">
      Open
      <ChevronUp class="size-3.5" aria-hidden="true" />
    </span>
  </button>
</div>

<DataDrawer bind:open={drawerOpen} {project} groups={options} {narrowed} />

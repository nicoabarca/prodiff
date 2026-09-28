import type { Summary } from "$lib/analysis/types";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { ResponseGroupComparison } from "$lib/statistics/invokers/types";
import { attributeLabel } from "$lib/custom-attributes/state/custom-attributes.svelte";
import { formatDecimal, formatDuration, formatNumber } from "$lib/format";
import { formatSigned, isGap, percentChange, share } from "$lib/statistics/utils/change";

export const PANES = ["overview", "duration", "activities", "attributes", "variants"] as const;
export type Pane = (typeof PANES)[number];

export const ACTIVITY_MEASURES = ["share", "epc", "time"] as const;
export type ActivityMeasure = (typeof ACTIVITY_MEASURES)[number];

export const ACTIVITY_MEASURE_LABELS: Record<ActivityMeasure, string> = {
  share: "Share of cases",
  epc: "Events per case",
  time: "Avg. time in activity"
};

/** A difference in percentage points for shares, in percent for everything else. */
export function measureUnit(measure: ActivityMeasure): "pp" | "%" {
  return measure === "share" ? "pp" : "%";
}

/** A value per Group id, and B against A in the measure's unit. Null where a Group has none. */
export interface Figure {
  name: string;
  values: Record<string, number | null>;
  delta: number | null;
}

function delta(ids: string[], values: Record<string, number | null>, unit: "pp" | "%") {
  if (ids.length < 2) return null;
  const [a, b] = [values[ids[0]], values[ids[1]]];
  if (a === null || b === null || a === undefined || b === undefined) return null;
  return unit === "pp" ? b - a : percentChange(a, b);
}

/** Biggest gaps first; a row with no difference to rank keeps its name order. */
function byGap(a: Figure, b: Figure): number {
  const size = (figure: Figure) => (figure.delta === null ? -1 : Math.abs(figure.delta));
  return size(b) - size(a) || a.name.localeCompare(b.name);
}

export interface OverviewMetric {
  label: string;
  unit: string;
  pane: Pane;
  value: (stats: ResponseEventLogStats) => number | null;
  format: (value: number | null) => string;
}

const count = (value: number | null) => (value === null ? "—" : formatNumber(value));

export const OVERVIEW_METRICS: OverviewMetric[] = [
  {
    label: "Variants",
    unit: "distinct paths",
    pane: "variants",
    value: (s) => s.variants,
    format: count
  },
  {
    label: "Avg. events / case",
    unit: "",
    pane: "activities",
    value: (s) => s.avgEventsPerCase,
    format: (v) => (v === null ? "—" : formatDecimal(v))
  },
  {
    label: "Avg. case duration",
    unit: "",
    pane: "duration",
    value: (s) => s.avgCaseDurationMs,
    format: formatDuration
  },
  {
    label: "Median case duration",
    unit: "",
    pane: "duration",
    value: (s) => s.medianCaseDurationMs,
    format: formatDuration
  },
  {
    label: "Activities",
    unit: "distinct",
    pane: "activities",
    value: (s) => s.activities,
    format: count
  },
  {
    label: "Start activities",
    unit: "distinct",
    pane: "activities",
    value: (s) => s.startActivities,
    format: count
  },
  {
    label: "End activities",
    unit: "distinct",
    pane: "activities",
    value: (s) => s.endActivities,
    format: count
  }
];

export function metricFigure(
  metric: OverviewMetric,
  ids: string[],
  stats: Record<string, ResponseEventLogStats>
): Figure {
  const values = Object.fromEntries(
    ids.map((id) => [id, stats[id] ? metric.value(stats[id]) : null])
  );
  return { name: metric.label, values, delta: delta(ids, values, "%") };
}

export function activityFigures(
  comparison: ResponseGroupComparison,
  ids: string[],
  measure: ActivityMeasure
): Figure[] {
  const cases = Object.fromEntries(comparison.groups.map((group) => [group.id, group.cases]));
  return comparison.activities
    .map((row) => {
      const values = Object.fromEntries(
        ids.map((id): [string, number | null] => {
          const touching = row.cases[id] ?? 0;
          if (measure === "share") return [id, share(touching, cases[id] ?? 0)];
          if (measure === "epc")
            return [id, touching === 0 ? null : (row.events[id] ?? 0) / touching];
          return [id, row.avgDurationMs[id] ?? null];
        })
      );
      return { name: row.name, values, delta: delta(ids, values, measureUnit(measure)) };
    })
    .sort(byGap);
}

/**
 * Shares of an attribute's values per Group, in percent of that Group's values.
 * The `limit` biggest by pooled count, then `Other` for the rest, cut values
 * included.
 */
export function valueShares(
  summaries: Record<string, Summary>,
  ids: string[],
  limit = 8
): Figure[] {
  const categorical = ids.map((id) => {
    const summary = summaries[id];
    return summary?.type === "categorical" ? summary : null;
  });
  const pooled = new Map<string, number>();
  for (const summary of categorical) {
    for (const [value, n] of Object.entries(summary?.counts ?? {})) {
      pooled.set(value, (pooled.get(value) ?? 0) + n);
    }
  }
  const ranked = [...pooled.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = ranked.slice(0, limit).map(([value]) => value);

  const figure = (name: string, countOf: (index: number) => number): Figure => {
    const values = Object.fromEntries(
      ids.map((id, index) => [id, share(countOf(index), categorical[index]?.n ?? 0)])
    );
    return { name, values, delta: delta(ids, values, "pp") };
  };
  const rows = kept.map((value) => figure(value, (i) => categorical[i]?.counts[value] ?? 0));
  const rest = (index: number) => {
    const summary = categorical[index];
    if (!summary) return 0;
    return summary.n - kept.reduce((sum, value) => sum + (summary.counts[value] ?? 0), 0);
  };
  if (ids.some((_, index) => rest(index) > 0)) {
    rows.push(figure(`Other (${ranked.length - kept.length})`, rest));
  }
  return rows;
}

export function variantFigures(comparison: ResponseGroupComparison, ids: string[]): Figure[] {
  const cases = Object.fromEntries(comparison.groups.map((group) => [group.id, group.cases]));
  return comparison.variants.map((row) => {
    const values = Object.fromEntries(
      ids.map((id) => [id, share(row.cases[id] ?? 0, cases[id] ?? 0)])
    );
    return {
      name: row.activities.join(" → "),
      values,
      delta: delta(ids, values, "pp")
    };
  });
}

/** One entry of Overview's Biggest differences: where it lives, what, and by how much. */
export interface Difference {
  pane: Pane;
  what: string;
  measure: string;
  delta: number;
  label: string;
}

/**
 * The four largest gaps across activity shares, the values of every
 * significant categorical attribute and the Variants, largest first. Only gaps
 * of at least 5 pp count.
 */
export function biggestDifferences(
  comparison: ResponseGroupComparison,
  ids: string[],
  limit = 4
): Difference[] {
  if (ids.length < 2) return [];
  const gaps = (pane: Pane, figures: Figure[], measure: string, what = (n: string) => n) =>
    figures
      .filter((figure) => isGap(figure.delta))
      .map((figure): Difference => ({
        pane,
        what: what(figure.name),
        measure,
        delta: figure.delta ?? 0,
        label: formatSigned(figure.delta, 1, " pp")
      }));

  const attributes = comparison.attributes
    .filter((row) => row.test?.significant && row.test.test === "chi2")
    .flatMap((row) =>
      gaps(
        "attributes",
        valueShares(row.summaries, ids).filter((figure) => !figure.name.startsWith("Other (")),
        row.scope === "case" ? "share of cases" : "share of events",
        (value) => `${attributeLabel(row.name)} = ${value}`
      )
    );

  return [
    ...gaps("activities", activityFigures(comparison, ids, "share"), "share of cases"),
    ...attributes,
    ...gaps("variants", variantFigures(comparison, ids).slice(0, 50), "share of cases")
  ]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

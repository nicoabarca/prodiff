/**
 * What the graph can be asked to paint, and how one measure reads for a node.
 * Everything here reads figures already in hand, so changing the measure never
 * asks Rust again and never moves a box.
 *
 * Two sources meet in a `Measurable` and they describe different things. The
 * counts come from the fold, so they follow the cut on screen; an attribute's
 * Summary is what Rust measured over the built Variants, so it does not. The
 * panel says so where it prints them.
 */
import {
  attributeOptions,
  isDurationAttribute,
  isNumericAttribute
} from "$lib/analysis/attributes";
import type { AttributeBlock, Test } from "$lib/analysis/types";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import {
  analysisColumns,
  attributeLabel,
  customColumns
} from "$lib/custom-attributes/state/custom-attributes.svelte";
import type { Project } from "$lib/event-log/types";
import type { Counts, ResponseDfg } from "$lib/dfg/invokers/types";
import type { Frequency, Measure } from "$lib/dfg/types";
import { unionCount } from "$lib/dfg/utils/fold";
import { pooledMean } from "$lib/groups/utils/shade";
import { formatDecimal, formatDuration, formatNumber } from "$lib/format";

export interface Measurable {
  counts: Record<string, Counts>;
  attributes: Record<string, AttributeBlock>;
}

export const CASES: Measure = { kind: "cases" };
export const EVENTS: Measure = { kind: "events" };

/**
 * The unit the fold counts in for a measure. An attribute has none of its own,
 * so the paths it is drawn with are still cut and placed by cases.
 */
export function frequencyOf(measure: Measure): Frequency {
  return measure.kind === "events" ? "events" : "cases";
}

/** Identifies a measure, for keying a row's cells and a select's options. */
export function measureKey(measure: Measure): string {
  return measure.kind === "attribute" ? `attribute:${measure.name}` : measure.kind;
}

export function measureFromKey(key: string, measures: Measure[]): Measure {
  return measures.find((measure) => measureKey(measure) === key) ?? CASES;
}

/** What the user reads for a measure. A Custom Attribute reads as its name. */
export function measureLabel(measure: Measure): string {
  if (measure.kind === "cases") return "Cases";
  if (measure.kind === "events") return "Events";
  return attributeLabel(measure.name);
}

/**
 * The measures the graph can paint: the two frequencies, then every numeric
 * attribute the build was asked to test. A categorical attribute has no
 * magnitude to shade or rank by, so it stays out and is read in the detail
 * panel instead.
 */
export function measureOptions(columns: RequestColumnMapping[], attributes: string[]): Measure[] {
  const numeric = attributes
    .filter((name) => isNumericAttribute(columns, name))
    .map((name): Measure => ({ kind: "attribute", name }));
  return [CASES, EVENTS, ...numeric];
}

/**
 * The measures a built graph can be painted by: the frequencies, then the
 * numeric attributes it holds figures for or has been asked for, in the
 * project's own order. An attribute asked for counts from the moment it is
 * asked, so a measure picked at the same time as its attribute is not knocked
 * back to Cases while the build is in flight.
 */
export function measuresFor(
  project: Project,
  graph: ResponseDfg | null,
  requested: string[] = []
): Measure[] {
  const held = new Set([
    ...(graph?.nodes.flatMap((node) => Object.keys(node.attributes)) ?? []),
    ...requested
  ]);
  const options = attributeOptions(
    project.columns,
    project.hiddenColumns,
    customColumns(project)
  ).filter((name) => held.has(name));
  return measureOptions(analysisColumns(project), options);
}

/** A measure no longer among the options falls back to Cases. */
export function keptMeasure(measure: Measure, options: Measure[]): Measure {
  const key = measureKey(measure);
  return options.some((option) => measureKey(option) === key) ? measure : CASES;
}

/** One Group's figure for a measure, `null` where that Group has none here. */
export function measureValue(node: Measurable, groupId: string, measure: Measure): number | null {
  if (measure.kind !== "attribute") {
    const value = node.counts[groupId]?.[measure.kind] ?? 0;
    return value === 0 ? null : value;
  }
  const summary = node.attributes[measure.name]?.summaries[groupId];
  return summary?.type === "numerical" ? summary.mean : null;
}

/**
 * The figure a shade or a thickness is drawn from: the sum over the Groups for
 * a frequency, the mean over all their cases for an attribute.
 */
export function measureUnion(node: Measurable, measure: Measure): number | null {
  if (measure.kind !== "attribute") {
    const total = unionCount(node.counts, measure.kind);
    return total === 0 ? null : total;
  }
  const block = node.attributes[measure.name];
  if (!block) return null;
  return pooledMean(
    Object.values(block.summaries).flatMap((summary) =>
      summary.type === "numerical" ? [{ mean: summary.mean, n: summary.n }] : []
    )
  );
}

/** The Significance Test behind a measure. A frequency is not tested. */
export function measureTest(node: Measurable, measure: Measure): Test | null {
  return measure.kind === "attribute" ? (node.attributes[measure.name]?.test ?? null) : null;
}

export function formatMeasure(value: number | null, measure: Measure): string | null {
  if (value === null) return null;
  if (measure.kind !== "attribute") return formatNumber(value);
  return isDurationAttribute(measure.name) ? formatDuration(value) : formatDecimal(value);
}

/**
 * A node as one Group sees it, with every other Group's figures dropped, so a
 * split panel's faces, shades and thicknesses rank within its own Group. The
 * whole comparison passes through unchanged.
 */
export function facing(node: Measurable, focus: string | null): Measurable {
  if (focus === null) return node;
  const summaryOf = (block: AttributeBlock) => {
    const summary = block.summaries[focus];
    return { summaries: summary ? { [focus]: summary } : {}, test: block.test };
  };
  return {
    counts: { [focus]: node.counts[focus] ?? { cases: 0, events: 0 } },
    attributes: Object.fromEntries(
      Object.entries(node.attributes).map(([name, block]) => [name, summaryOf(block)])
    )
  };
}

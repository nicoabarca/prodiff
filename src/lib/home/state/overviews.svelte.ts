import { db } from "$lib/db/client";
import {
  comparisons as comparisonsTable,
  customAttributes as customAttributesTable,
  groups as groupsTable
} from "$lib/db/schema";
import { fetchEventLogFileSize } from "$lib/event-log/invokers/event-log-file-size";
import type { Project } from "$lib/event-log/types";
import { dailyCaseLoad } from "$lib/filters/invokers/daily-case-load";
import { groupStats } from "$lib/groups/invokers/group-stats";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import { ORIGINAL_ID, type Group } from "$lib/groups/types";
import { activityBars } from "$lib/home/utils/activity";

/** What the stored rows say about a Project beyond its own record. */
export interface ProjectRecords {
  groups: Group[];
  comparedIds: string[];
  customAttributes: number;
}

/**
 * What a Project card reads from its files. Each field is null until its
 * command answers, and stays null when it fails.
 */
export interface ProjectFigures {
  size: number | null;
  stats: ResponseEventLogStats | null;
  bars: number[] | null;
}

/** Every Project's Groups, comparison and Custom Attribute count, keyed by Project id. */
export const records = $state<Record<string, ProjectRecords>>({});

/** Figures per Project, kept while the app is open. Keyed by `figuresKey`. */
export const figures = $state<Record<string, ProjectFigures>>({});

const EMPTY: ProjectRecords = { groups: [], comparedIds: [], customAttributes: 0 };

export function recordsOf(projectId: string): ProjectRecords {
  return records[projectId] ?? EMPTY;
}

export async function loadRecords() {
  const [groupRows, comparisonRows, attributeRows] = await Promise.all([
    db().select().from(groupsTable),
    db().select().from(comparisonsTable),
    db().select({ projectId: customAttributesTable.projectId }).from(customAttributesTable)
  ]);

  const next: Record<string, ProjectRecords> = {};
  const entry = (projectId: string) =>
    (next[projectId] ??= { groups: [], comparedIds: [], customAttributes: 0 });
  for (const group of groupRows.sort((a, b) => a.position - b.position)) {
    entry(group.projectId).groups.push(group);
  }
  for (const row of comparisonRows) entry(row.projectId).comparedIds = row.groupIds;
  for (const row of attributeRows) entry(row.projectId).customAttributes += 1;

  for (const id of Object.keys(records)) delete records[id];
  Object.assign(records, next);
}

/** A recreated Project keeps its id, so its creation time tells the two apart. */
function figuresKey(project: Project): string {
  return `${project.id}:${project.createdAt}`;
}

export function figuresOf(project: Project): ProjectFigures | null {
  return figures[figuresKey(project)] ?? null;
}

/** Starts reading a Project's figures, once per Project while the app is open. */
export function loadFigures(project: Project) {
  const key = figuresKey(project);
  if (figures[key]) return;
  figures[key] = { size: null, stats: null, bars: null };

  fetchEventLogFileSize(project.originalPath)
    .then((size) => (figures[key].size = size))
    .catch(() => {});
  groupStats(project, [ORIGINAL_ID])
    .then(([stats]) => (figures[key].stats = stats))
    .catch(() => {});
  dailyCaseLoad(project, [])
    .then((days) => (figures[key].bars = activityBars(days)))
    .catch(() => {});
}

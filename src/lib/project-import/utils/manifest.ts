/**
 * Reading a manifest and turning it into rows, shared by `scripts/seed.ts`
 * under Node and the study import in the app. Nothing here touches Tauri.
 */
import { v5 as uuidv5 } from "uuid";
import type { ResponseEmptyCount } from "$lib/custom-attributes/invokers/types";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import {
  customAttributeColumn,
  customAttributeId
} from "$lib/custom-attributes/utils/custom-attribute-id";
import { parseFormula } from "$lib/custom-attributes/utils/parser";
import { formulaColumnError, nameError } from "$lib/custom-attributes/utils/validate";
import type { ResponseCreateEventLog } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";
import type { Filter, FilterKind } from "$lib/filters/kind/filter";
import { defaultColor } from "$lib/groups/colors";
import type { ResponseEventLogStats } from "$lib/groups/invokers/types";
import type { Group } from "$lib/groups/types";
import { groupId } from "$lib/groups/utils/group-id";
import type {
  Manifest,
  ManifestFilter,
  ResolvedCustomAttribute,
  ResolvedGroup,
  ResolvedManifest
} from "$lib/project-import/types";

export const MANIFEST_FORMAT_VERSION = 1;

const FILTER_KINDS: Record<FilterKind, true> = {
  attribute: true,
  numeric: true,
  timeframe: true,
  endpoint: true,
  duration: true,
  follower: true,
  case_not_in_group: true
};

/** `version` when the manifest was written for another format, `unreadable` otherwise. */
export class ManifestError extends Error {
  constructor(
    message: string,
    readonly kind: "unreadable" | "version"
  ) {
    super(message);
    this.name = "ManifestError";
  }
}

function unreadable(message: string): never {
  throw new ManifestError(message, "unreadable");
}

function duplicate(names: string[]): string | undefined {
  return names.find((name, index) => names.indexOf(name) !== index);
}

/**
 * Parses `text` and checks what a hand-written manifest gets wrong. The shape
 * of each Column Mapping entry and Filter is left to Rust, which refuses a bad
 * one before anything is replaced.
 */
export function readManifest(text: string): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    unreadable(`manifest.json is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof value !== "object" || value === null) unreadable("manifest.json is not an object.");
  const manifest = value as Manifest;
  if (manifest.formatVersion !== MANIFEST_FORMAT_VERSION) {
    throw new ManifestError(
      `manifest.json has formatVersion ${String(manifest.formatVersion)}; this build reads ${MANIFEST_FORMAT_VERSION}.`,
      "version"
    );
  }
  if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
    unreadable("manifest.json has no name.");
  }
  if (!Array.isArray(manifest.columns)) unreadable("manifest.json has no columns.");
  if (!Array.isArray(manifest.hiddenColumns)) unreadable("manifest.json has no hiddenColumns.");
  const columnNames = new Set(manifest.columns.map((column) => column.name));
  const unknownHidden = manifest.hiddenColumns.find((name) => !columnNames.has(name));
  if (unknownHidden !== undefined) {
    unreadable(`Hidden column "${unknownHidden}" is not a column.`);
  }

  const groups = manifest.groups ?? [];
  for (const group of groups) {
    if (!Array.isArray(group.filters)) unreadable(`Group "${group.name}" has no filters.`);
    group.filters.forEach((filter, index) => {
      if (!Object.hasOwn(FILTER_KINDS, filter.kind)) {
        unreadable(`Group "${group.name}", filter ${index + 1}: unknown kind "${filter.kind}".`);
      }
    });
  }
  const sameGroup = duplicate(groups.map((group) => group.name));
  if (sameGroup !== undefined) unreadable(`Two Groups are called "${sameGroup}".`);
  const sameAttribute = duplicate((manifest.customAttributes ?? []).map((a) => a.name));
  if (sameAttribute !== undefined) {
    unreadable(`Two Custom Attributes are called "${sameAttribute}".`);
  }
  return manifest;
}

function resolveCustomAttributes(manifest: Manifest): ResolvedCustomAttribute[] {
  const project = { columns: manifest.columns, hiddenColumns: manifest.hiddenColumns } as Project;
  const resolved: ResolvedCustomAttribute[] = [];
  for (const attribute of manifest.customAttributes ?? []) {
    const scope = attribute.scope ?? "event";
    const parsed = parseFormula(attribute.formula);
    const problem =
      nameError(
        attribute.name,
        project,
        resolved.map(({ id, name }) => ({ id, name }) as CustomAttribute),
        null
      ) ?? (parsed.ok ? formulaColumnError(parsed.formula, project, scope)?.message : parsed.error);
    if (problem || !parsed.ok) {
      throw new Error(`Custom attribute "${attribute.name}": ${problem}.`);
    }
    resolved.push({
      id: customAttributeId(),
      name: attribute.name,
      scope,
      text: attribute.formula,
      formula: parsed.formula
    });
  }
  return resolved;
}

/**
 * Generates every id, checks each formula, and points each `case_not_in_group`
 * at an earlier Group and each numeric Filter's `attribute` at that Custom
 * Attribute's `fx_{id}` column.
 */
export function resolveManifest(manifest: Manifest): ResolvedManifest {
  const customAttributes = resolveCustomAttributes(manifest);
  const columnOf = new Map(customAttributes.map((a) => [a.name, customAttributeColumn(a.id)]));
  const groupIds = new Map<string, string>();

  const resolveFilter = (groupName: string, filter: ManifestFilter, index: number): Filter => {
    if (filter.kind === "case_not_in_group") {
      const excluded = groupIds.get(filter.group);
      if (!excluded) {
        throw new Error(
          `Group "${groupName}", filter ${index + 1}: case_not_in_group names "${filter.group}", which is not an earlier Group.`
        );
      }
      return { kind: "case_not_in_group", groupId: excluded };
    }
    if ("attribute" in filter) {
      const { attribute, ...numeric } = filter;
      const column = columnOf.get(attribute);
      if (!column) {
        throw new Error(
          `Group "${groupName}", filter ${index + 1}: no Custom Attribute is called "${attribute}".`
        );
      }
      return { ...numeric, column };
    }
    return filter;
  };

  const groups = (manifest.groups ?? []).map((group): ResolvedGroup => {
    const resolved = {
      ...group,
      id: groupId(),
      filters: group.filters.map((filter, index) => resolveFilter(group.name, filter, index))
    };
    groupIds.set(group.name, resolved.id);
    return resolved;
  });

  return {
    name: manifest.name,
    columns: manifest.columns,
    hiddenColumns: manifest.hiddenColumns,
    customAttributes,
    groups
  };
}

/** The id a manifest's Project takes in the app, the same for every import of it. */
export function importedProjectId(name: string): string {
  return uuidv5(`prodiff:import:${name}`, uuidv5.URL);
}

/**
 * The rows a built manifest is stored as. `eventLog` must name the files where
 * they end up, and `customAttributes` and `groups` follow the order they were
 * built in.
 */
export function importedRows(
  projectId: string,
  resolved: ResolvedManifest,
  built: {
    eventLog: ResponseCreateEventLog;
    customAttributes: ResponseEmptyCount[];
    groups: ResponseEventLogStats[];
  },
  fileName: string,
  now: string
): { project: Project; customAttributes: CustomAttribute[]; groups: Group[] } {
  const { eventLog } = built;
  const project: Project = {
    id: projectId,
    name: resolved.name,
    fileName,
    originalPath: eventLog.originalPath,
    eventLogPath: eventLog.eventLogPath,
    columns: resolved.columns,
    hiddenColumns: resolved.hiddenColumns,
    events: eventLog.events,
    cases: eventLog.cases,
    activities: eventLog.activities,
    variants: eventLog.variants,
    timespanStart: eventLog.timespanStart,
    timespanEnd: eventLog.timespanEnd,
    createdAt: now
  };
  const customAttributes = resolved.customAttributes.map(
    (attribute, position): CustomAttribute => ({
      id: attribute.id,
      projectId,
      name: attribute.name,
      scope: attribute.scope,
      formula: attribute.text,
      position,
      emptyCount: built.customAttributes.find((count) => count.id === attribute.id)?.empty ?? null,
      createdAt: now,
      editedAt: now
    })
  );
  const groups = resolved.groups.map((group, position): Group => ({
    id: group.id,
    projectId,
    name: group.name,
    color: group.color ?? defaultColor(position),
    position,
    filters: group.filters,
    stats: built.groups[position],
    createdAt: now,
    editedAt: now
  }));
  return { project, customAttributes, groups };
}

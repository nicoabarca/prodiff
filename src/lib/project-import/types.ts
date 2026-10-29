import type { AttributeScope, Formula } from "$lib/custom-attributes/invokers/types";
import type { CustomAttribute } from "$lib/custom-attributes/types";
import type { RequestColumnMapping } from "$lib/event-log/invokers/types";
import type { Project } from "$lib/event-log/types";
import type { CaseNotInGroupFilter } from "$lib/filters/kind/case-not-in-group";
import type { Filter } from "$lib/filters/kind/filter";
import type { NumericFilter } from "$lib/filters/kind/numeric";
import type { Group } from "$lib/groups/types";

/**
 * A Filter as a manifest writes it: `case_not_in_group` names an earlier Group,
 * and a numeric Filter may name a Custom Attribute in `attribute` in place of
 * `column`.
 */
export type ManifestFilter =
  | Exclude<Filter, CaseNotInGroupFilter>
  | { kind: "case_not_in_group"; group: string }
  | (Omit<NumericFilter, "column"> & { attribute: string });

export type ManifestGroup = Pick<Group, "name"> &
  Partial<Pick<Group, "color">> & { filters: ManifestFilter[] };

export type ManifestCustomAttribute = Pick<CustomAttribute, "name" | "formula"> &
  Partial<Pick<CustomAttribute, "scope">>;

/** A Project as `pnpm seed` and "Import study Project" read it, beside its CSV. */
export interface Manifest {
  formatVersion: number;
  name: string;
  columns: RequestColumnMapping[];
  hiddenColumns: string[];
  customAttributes?: ManifestCustomAttribute[];
  groups?: ManifestGroup[];
}

/** A Custom Attribute with its new id, its formula as written and as parsed. */
export interface ResolvedCustomAttribute {
  id: string;
  name: string;
  scope: AttributeScope;
  text: string;
  formula: Formula;
}

export type ResolvedGroup = Pick<Group, "id" | "name" | "filters"> & Partial<Pick<Group, "color">>;

/** A manifest with every id generated and every name pointed at its id. */
export interface ResolvedManifest {
  name: string;
  columns: RequestColumnMapping[];
  hiddenColumns: string[];
  customAttributes: ResolvedCustomAttribute[];
  groups: ResolvedGroup[];
}

/** A bundle read and checked, with no Project written yet. */
export interface PreparedImport {
  projectId: string;
  resolved: ResolvedManifest;
  csvPath: string;
  csvFileName: string;
  replaces: boolean;
}

export interface ImportedProject {
  project: Project;
  groups: number;
}

/** What a failed import shows: one sentence to act on, and the error itself. */
export interface ImportFailure {
  sentence: string;
  detail: string;
}

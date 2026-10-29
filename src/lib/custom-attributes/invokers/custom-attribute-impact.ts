import { invoke } from "@tauri-apps/api/core";
import type {
  AttributeScope,
  Formula,
  ResponseCustomAttributeImpact
} from "$lib/custom-attributes/invokers/types";
import type { Project } from "$lib/event-log/types";

/** What a draft formula would compute over the whole Event Log. Writes nothing. */
export function customAttributeImpact(
  project: Project,
  scope: AttributeScope,
  formula: Formula
): Promise<ResponseCustomAttributeImpact> {
  return invoke<ResponseCustomAttributeImpact>("custom_attribute_impact", {
    projectId: project.id,
    scope,
    formula,
    columns: project.columns
  });
}
